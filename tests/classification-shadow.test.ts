import { afterEach, describe, expect, it, setSystemTime } from "bun:test";
import { Database } from "bun:sqlite";
import { catalogDecisionReason, listingFingerprint, MAX_AUDIT_LISTINGS_PER_CHECKPOINT, recordSourceDecisions, reserveShadowCall, runClassificationShadow, shadowDailyLimit } from "@worker/classification-shadow";
import { classifyWithJev, JEV_MODEL, JEV_QUESTIONS, JEV_WORKERS_AI_MODEL, type JevRunner } from "@worker/jev";
import type { JobListing } from "@worker/adapters/types";
import type { Env } from "@worker/types";

const databases: Database[] = [];
afterEach(() => { for (const db of databases.splice(0)) db.close(); });
type Binding = string | number | null;

async function fixture() {
  const sqlite = new Database(":memory:");
  databases.push(sqlite);
  sqlite.exec("PRAGMA foreign_keys=ON; CREATE TABLE companies(id TEXT PRIMARY KEY); INSERT INTO companies VALUES ('company'); CREATE TABLE preferences(key TEXT PRIMARY KEY, value TEXT);");
  sqlite.exec(await Bun.file(new URL("../migrations/0078_classification_shadow.sql", import.meta.url)).text());
  let batches = 0;
  const db = {
    prepare(sql: string) {
      let bindings: Binding[] = [];
      const statement = {
        bind(...values: Binding[]) { bindings = values; return statement; },
        async first() { return sqlite.query(sql).get(...bindings); },
        async all() { return { results: sqlite.query(sql).all(...bindings) }; },
        async run() { return sqlite.query(sql).run(...bindings); },
        execute() { return sqlite.query(sql).run(...bindings); },
      };
      return statement;
    },
    async batch(statements: { execute(): unknown }[]) {
      batches++;
      return sqlite.transaction(() => statements.map((stmt) => stmt.execute()))();
    },
  } as unknown as D1Database;
  return { db, sqlite, batches: () => batches };
}

const job: JobListing = { externalId: "one", title: "Software Engineer", location: "Seattle, WA", department: "Software", description: "Build backend software. Two years of experience required.", postedAt: null, salary: null, url: "https://example.com/jobs/one" };

function providerResponse() {
  return { model: `${JEV_MODEL}.0`, usage: { input_tokens: 1000, output_tokens: 50 },
    answers: Object.fromEntries(Object.entries(JEV_QUESTIONS).map(([name, question]) => [name, { choice: Object.keys(question.criteria)[0] }])) };
}

function fakeAi(respond: (model: string, inputs: { state: unknown; questions: unknown }) => Promise<unknown>) {
  return { run: (model: string, inputs: unknown) => respond(model, inputs as { state: unknown; questions: unknown }) } as JevRunner;
}

const noAlerts = async () => 0;

describe("classification shadow", () => {
  it("bounds large source snapshots and progressively records unseen listings", async () => {
    const { db, sqlite, batches } = await fixture();
    const jobs = Array.from({ length: 60 }, (_, index) => ({ ...job, externalId: `job-${index}` }));
    await recordSourceDecisions(db, "company", jobs, [], false);
    expect(sqlite.query("SELECT COUNT(*) AS count FROM source_job_decisions").get()).toEqual({ count: MAX_AUDIT_LISTINGS_PER_CHECKPOINT });
    expect(batches()).toBe(1);
    await recordSourceDecisions(db, "company", jobs, [], false);
    expect(sqlite.query("SELECT COUNT(*) AS count FROM source_job_decisions").get()).toEqual({ count: 50 });
    await recordSourceDecisions(db, "company", jobs, [], false);
    expect(sqlite.query("SELECT COUNT(*) AS count FROM source_job_decisions").get()).toEqual({ count: 60 });
  });

  it("records both accepts and rejects and skips unchanged deterministic writes", async () => {
    const { db, sqlite, batches } = await fixture();
    const jobs = [job, { ...job, externalId: "recruiter", title: "Recruiter" }, { ...job, externalId: "london", location: "London, UK" }];
    await recordSourceDecisions(db, "company", jobs, [], false);
    expect(sqlite.query("SELECT reason FROM source_job_decisions ORDER BY external_id").all()).toEqual([
      { reason: "rejected_location" }, { reason: "catalog_candidate" }, { reason: "rejected_non_technical_function" },
    ]);
    const first = batches();
    await recordSourceDecisions(db, "company", jobs, [], false);
    expect(batches()).toBe(first);
    await recordSourceDecisions(db, "company", [{ ...job, description: "Minimum qualifications: PhD required." }], [], false);
    expect(sqlite.query("SELECT reason FROM source_job_decisions WHERE external_id='one'").get()).toEqual({ reason: "catalog_candidate" });
  });

  it("includes rejected geography and job families in shadow samples without altering production tables", async () => {
    const { db, sqlite } = await fixture();
    await recordSourceDecisions(db, "company", [job, { ...job, externalId: "two", location: "London, UK" }, { ...job, externalId: "three", title: "Recruiter" }], [], true);
    expect(sqlite.query("SELECT COUNT(*) AS count FROM job_classification_shadow").get()).toEqual({ count: 3 });
    await recordSourceDecisions(db, "company", [job], [], true);
    expect(sqlite.query("SELECT COUNT(*) AS count FROM job_classification_shadow").get()).toEqual({ count: 3 });
    expect(sqlite.query("SELECT name FROM sqlite_master WHERE name IN ('jobs','job_features','notification_candidates')").all()).toEqual([]);
  });

  it("invalidates cached scope decisions when custom titles or policy change", async () => {
    const { db, sqlite } = await fixture();
    const generic = { ...job, title: "Technical Builder", department: null };
    await recordSourceDecisions(db, "company", [generic], [], false);
    expect(sqlite.query("SELECT reason FROM source_job_decisions").get()).toEqual({ reason: "rejected_no_technical_signal" });
    await recordSourceDecisions(db, "company", [generic], ["Technical Builder"], false);
    expect(sqlite.query("SELECT reason FROM source_job_decisions").get()).toEqual({ reason: "catalog_candidate" });
    sqlite.query("UPDATE source_job_decisions SET gate_version='old', reason='incorrect'").run();
    await recordSourceDecisions(db, "company", [generic], ["Technical Builder"], false);
    expect(sqlite.query("SELECT reason FROM source_job_decisions").get()).toEqual({ reason: "catalog_candidate" });
  });

  it("ages an unchanged candidate out of freshness without a content update", async () => {
    const { db, sqlite } = await fixture();
    const now = Date.now();
    const dated = { ...job, postedAt: new Date(now).toISOString() };
    try {
      await recordSourceDecisions(db, "company", [dated], [], false);
      setSystemTime(new Date(now + 40 * 86_400_000));
      await recordSourceDecisions(db, "company", [dated], [], false);
      expect(sqlite.query("SELECT reason FROM source_job_decisions").get()).toEqual({ reason: "rejected_freshness" });
    } finally { setSystemTime(); }
  });

  it("caps inference text but invalidates the cache for changes past the cap", async () => {
    const { db, sqlite } = await fixture();
    const long = { ...job, description: "x".repeat(13_000) };
    expect(await listingFingerprint(long)).not.toBe(await listingFingerprint({ ...long, description: `${long.description} changed` }));
    await recordSourceDecisions(db, "company", [long], [], true);
    const row = sqlite.query("SELECT input_json, truncated FROM job_classification_shadow").get() as { input_json: string; truncated: number };
    expect(row.truncated).toBe(1);
    expect(JSON.parse(row.input_json).description.length).toBe(12_000);
  });

  it("enforces the queue cap in the database", async () => {
    const { sqlite } = await fixture();
    const insert = sqlite.query("INSERT INTO job_classification_shadow(cache_key, company_id, external_id, reason, queued_at) VALUES (?, 'company', ?, 'test', 'now')");
    for (let i = 0; i < 501; i++) insert.run(String(i), String(i));
    expect(sqlite.query("SELECT COUNT(*) AS count FROM job_classification_shadow").get()).toEqual({ count: 500 });
  });

  it("reserves a hard daily budget before inference, including overlapping reservations", async () => {
    const { db, sqlite } = await fixture();
    const reservations = await Promise.all(Array.from({ length: 110 }, () => reserveShadowCall(db, "2026-10-03", 100)));
    expect(reservations.filter(Boolean).length).toBe(100);
    expect(await reserveShadowCall(db, "2026-10-04", 0)).toBe(false);
    expect(sqlite.query("SELECT calls FROM classification_daily_budget").get()).toEqual({ calls: 100 });
    expect(shadowDailyLimit("100000")).toBe(100);
    expect(shadowDailyLimit("invalid")).toBe(0);
    expect(shadowDailyLimit("-1")).toBe(0);
  });

  it("does not call Jev with shadow disabled, no AI binding, or exhausted budget", async () => {
    const { db, sqlite } = await fixture();
    await recordSourceDecisions(db, "company", [job], [], true);
    let calls = 0;
    const AI = fakeAi(async () => { calls++; return providerResponse(); }) as unknown as Ai;
    expect(await runClassificationShadow({ DB: db, AI } as Env, noAlerts)).toBe(0);
    expect(await runClassificationShadow({ DB: db, JOB_CLASSIFICATION_SHADOW: "true" } as Env, noAlerts)).toBe(0);
    expect(await runClassificationShadow({ DB: db, AI, JOB_CLASSIFICATION_SHADOW: "true", JEV_DAILY_CALL_LIMIT: "0" } as Env, noAlerts)).toBe(0);
    expect(await runClassificationShadow({ DB: db, AI, JOB_CLASSIFICATION_SHADOW: "true", AI_MONTHLY_BUDGET_USD: "0" } as Env, noAlerts)).toBe(0);
    expect(calls).toBe(0);
    expect(sqlite.query("SELECT status, attempts FROM job_classification_shadow").get()).toEqual({ status: "pending", attempts: 0 });
  });

  it("claims work once across overlapping drains and stores provider usage separately", async () => {
    const { db, sqlite } = await fixture();
    await recordSourceDecisions(db, "company", [job], [], true);
    let calls = 0;
    const AI = fakeAi(async (model, inputs) => {
      calls++;
      expect(model).toBe(JEV_WORKERS_AI_MODEL);
      expect((inputs.state as { reason?: string }).reason).toBeUndefined();
      await new Promise((resolve) => setTimeout(resolve, 1));
      return providerResponse();
    }) as unknown as Ai;
    const env = { DB: db, AI, JOB_CLASSIFICATION_SHADOW: "true" } as Env;
    const results = await Promise.all([runClassificationShadow(env, noAlerts), runClassificationShadow(env, noAlerts)]);
    expect(results.reduce((sum, count) => sum + count, 0)).toBe(1);
    expect(calls).toBe(1);
    expect(sqlite.query("SELECT status, input_json, input_tokens, cost_usd FROM job_classification_shadow").get()).toEqual({ status: "complete", input_json: null, input_tokens: 1000, cost_usd: 0.000042 });
    expect(await runClassificationShadow(env, noAlerts)).toBe(0);
  });

  it("preserves failures and unknown costs without auto-retrying paid calls", async () => {
    const { db, sqlite } = await fixture();
    await recordSourceDecisions(db, "company", [job], [], true);
    let calls = 0;
    const AI = fakeAi(async () => { calls++; throw new Error("3040: capacity exceeded, secret provider detail"); }) as unknown as Ai;
    const env = { DB: db, AI, JOB_CLASSIFICATION_SHADOW: "true" } as Env;
    await runClassificationShadow(env, noAlerts);
    await runClassificationShadow(env, noAlerts);
    expect(calls).toBe(1);
    expect(sqlite.query("SELECT status, error_code, cost_usd FROM job_classification_shadow").get()).toEqual({ status: "failed", error_code: "jev_request_failed", cost_usd: null });
    expect(sqlite.query("SELECT calls FROM classification_daily_budget").get()).toEqual({ calls: 1 });
  });

  it("recovers an expired lease once and fails terminally after a second crash", async () => {
    const { db, sqlite } = await fixture();
    await recordSourceDecisions(db, "company", [job, { ...job, externalId: "two" }], [], true);
    sqlite.query("UPDATE job_classification_shadow SET status='running', attempts=CASE WHEN external_id='one' THEN 1 ELSE 2 END, started_at='2020-01-01T00:00:00Z'").run();
    let calls = 0;
    const AI = fakeAi(async () => { calls++; return providerResponse(); }) as unknown as Ai;
    await runClassificationShadow({ DB: db, AI, JOB_CLASSIFICATION_SHADOW: "true" } as Env, noAlerts);
    expect(calls).toBe(1);
    expect(sqlite.query("SELECT external_id, status, attempts, input_json FROM job_classification_shadow ORDER BY external_id").all()).toEqual([
      { external_id: "one", status: "complete", attempts: 2, input_json: null },
      { external_id: "two", status: "failed", attempts: 2, input_json: null },
    ]);
  });

  it("unwraps completed results, rejects malformed decisions and does not fabricate usage", async () => {
    const invalid = providerResponse();
    invalid.answers.us_eligibility.choice = "maybe";
    await expect(classifyWithJev({}, fakeAi(async () => invalid))).rejects.toThrow("jev_invalid_answers");
    await expect(classifyWithJev({}, fakeAi(async () => ({ ...providerResponse(), model: "jev-1.14.0" })))).rejects.toThrow("jev_invalid_model");
    const wrapped = await classifyWithJev({}, fakeAi(async () => ({ state: "Completed", result: providerResponse() })));
    expect(wrapped.model).toBe(`${JEV_MODEL}.0`);
    await expect(classifyWithJev({}, fakeAi(async () => ({ state: "Queued", result: providerResponse() })))).rejects.toThrow("jev_invalid_answers");
    const missingUsage = { ...providerResponse(), usage: undefined };
    const result = await classifyWithJev({}, fakeAi(async () => missingUsage));
    expect(result.costUsd).toBeNull();
    expect(result.inputTokens).toBeNull();
  });

  it("distinguishes missing content from a catalog candidate", () => {
    expect(catalogDecisionReason({ ...job, description: null })).toBe("needs_description");
    expect(catalogDecisionReason({ ...job, title: "PhD Research Intern" })).toBe("catalog_candidate");
  });
});
