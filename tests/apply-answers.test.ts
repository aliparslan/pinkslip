import { describe, expect, it } from "bun:test";
import { Hono } from "hono";
import { createEmptyResumeProfile, type ResumeProfile } from "../shared/resume-profile";
import type { FormControl } from "../shared/application-form";
import {
  describeCommonAnswer,
  effectiveAuthorization,
  staleAuthorizationKeys,
  validCommonAnswer,
} from "../shared/application-answers";
import { applicantFacts, learnAnswers, planApplication } from "../worker/apply/plan";
import type { JevRunner } from "../worker/jev";
import applyRoutes from "../worker/routes/apply";
import type { Env, Variables } from "../worker/types";
import { sqliteD1 } from "./sqlite-d1";

const empty = createEmptyResumeProfile();
const student: ResumeProfile = {
  ...empty,
  contact: { ...empty.contact, name: "Ali Arslan", email: "ali@example.com", location: "Austin, TX" },
};

async function answersDb() {
  const { sqlite, db } = sqliteD1();
  sqlite.run(`CREATE TABLE users (id TEXT PRIMARY KEY, name TEXT NOT NULL DEFAULT '', role TEXT NOT NULL DEFAULT 'user')`);
  sqlite.run(`CREATE TABLE companies (id TEXT PRIMARY KEY, name TEXT NOT NULL)`);
  sqlite.run(`CREATE TABLE jobs (id TEXT PRIMARY KEY, company_id TEXT NOT NULL, title TEXT NOT NULL, location TEXT NOT NULL DEFAULT '')`);
  sqlite.run(`CREATE TABLE user_profiles (user_id TEXT PRIMARY KEY, data TEXT NOT NULL, created_at TEXT, updated_at TEXT)`);
  sqlite.run(`CREATE TABLE user_search_profiles (user_id TEXT PRIMARY KEY, profile_json TEXT NOT NULL, onboarding_completed_at TEXT)`);
  sqlite.run(`CREATE TABLE classification_daily_budget (day TEXT PRIMARY KEY, calls INTEGER NOT NULL DEFAULT 0, reported_cost_usd REAL NOT NULL DEFAULT 0)`);
  sqlite.run(await Bun.file(new URL("../migrations/0085_application_prep.sql", import.meta.url)).text());
  sqlite.run(`INSERT INTO users (id, name) VALUES ('user-1', 'Ali'), ('user-2', 'Sam')`);
  sqlite.run(`INSERT INTO user_profiles (user_id, data) VALUES ('user-1', '${JSON.stringify(student).replace(/'/g, "''")}')`);
  const env = { DB: db, AUTO_APPLY: "on" } as Env;
  return { sqlite, db, env };
}

function routes(env: Env, userId = "user-1") {
  const app = new Hono<{ Bindings: Env; Variables: Variables }>();
  app.use("*", async (c, next) => {
    c.set("userId", userId);
    c.set("sessionId", null);
    c.set("sessionState", "authenticated");
    c.set("authTransport", "native");
    await next();
  });
  app.route("/apply", applyRoutes);
  return (path: string, init?: RequestInit, environment: Env = env) =>
    (app.fetch as unknown as (request: Request, env: Env) => Promise<Response>)(
      new Request(`https://pinkslip.test/apply${path}`, init),
      environment,
    );
}

const put = (value: unknown, label?: string): RequestInit => ({
  method: "PUT",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(label === undefined ? { value } : { value, label }),
});

const control = (ref: string, kind: FormControl["kind"], label: string, extra: Partial<FormControl> = {}): FormControl => ({
  ref, kind, label, required: true, options: [], searchable: false, value: null, ...extra,
});

/** A Jev that says "Yes" only when the applicant facts contain `needle`. */
function jevWhenFactsSay(needle: string, seen: string[] = []): JevRunner {
  return {
    async run(_model, inputs) {
      const { state, questions } = inputs as { state: string; questions: Record<string, unknown> };
      seen.push(state);
      const choice = state.includes(needle) ? "Yes" : "Not stated";
      const answers = Object.fromEntries(Object.keys(questions).map((ref) => [ref, { choice, probabilities: { [choice]: 0.9 } }]));
      return { state: "Completed", result: { answers, usage: { input_tokens: 100 } } };
    },
  };
}

describe("answers routes", () => {
  it("lists, edits, and deletes remembered answers", async () => {
    const { env, sqlite } = await answersDb();
    const call = routes(env);
    await learnAnswers(env.DB, "user-1", [
      control("a", "combobox", "Are you open to relocation?", { options: ["Yes", "No"], value: "Yes" }),
      control("b", "text", "What's your favorite programming language?", { value: "Go" }),
    ], new Date("2026-10-01T00:00:00Z"));

    const listed = await (await call("/answers")).json() as { answers: Array<{ key: string; label: string; value: unknown }> };
    expect(listed.answers.map((answer) => [answer.key, answer.value])).toEqual([
      ["q:what s your favorite programming language", "Go"],
      ["relocation", "yes"],
    ]);

    // A form-specific key travels in the path, spaces and all.
    const key = encodeURIComponent("q:what s your favorite programming language");
    const edited = await call(`/answers/${key}`, put("Rust"));
    expect(edited.status).toBe(200);
    expect(await edited.json()).toMatchObject({
      key: "q:what s your favorite programming language",
      label: "What's your favorite programming language?",
      value: "Rust",
    });

    expect((await call(`/answers/${key}`, { method: "DELETE" })).status).toBe(204);
    expect(sqlite.query("SELECT answer_key FROM application_answers").all()).toEqual([{ answer_key: "relocation" }]);
  });

  it("saves up-front answers under their shared keys", async () => {
    const { env, sqlite } = await answersDb();
    const call = routes(env);
    expect((await call("/answers/office_days", put("3"))).status).toBe(200);
    expect(await (await call("/answers/start_date", put("2027-06-01"))).json())
      .toMatchObject({ key: "start_date", label: "Earliest start", value: "2027-06-01" });
    expect((await call("/answers/pronouns", put(" she/her "))).status).toBe(200);
    expect(sqlite.query("SELECT answer_key, value_json FROM application_answers WHERE user_id = 'user-1' ORDER BY answer_key").all()).toEqual([
      { answer_key: "office_days", value_json: "\"3\"" },
      { answer_key: "pronouns", value_json: "\"she/her\"" },
      { answer_key: "start_date", value_json: "\"2027-06-01\"" },
    ]);
    // Another user sees none of it.
    const other = await (await routes(env, "user-2")("/answers")).json() as { answers: unknown[] };
    expect(other.answers).toEqual([]);
  });

  it("rejects answers of the wrong shape or size", async () => {
    const { env } = await answersDb();
    const call = routes(env);
    const status = async (path: string, init: RequestInit) => (await call(path, init)).status;
    expect(await status("/answers/office_days", put("6"))).toBe(400);
    expect(await status("/answers/office_days", put(3))).toBe(400);
    expect(await status("/answers/relocation", put("maybe"))).toBe(400);
    expect(await status("/answers/salary", put("x".repeat(121)))).toBe(400);
    expect(await status("/answers/q%3Aanything", put(""))).toBe(400);
    expect(await status("/answers/q%3Aanything", put("x".repeat(10_001)))).toBe(400);
    expect(await status("/answers/q%3Aanything", put(["a", 7]))).toBe(400);
    expect(await status("/answers/q%3Aanything", put(Array.from({ length: 51 }, (_, index) => String(index))))).toBe(400);
    expect(await status("/answers/q%3Aanything", { method: "PUT", body: "{}" })).toBe(400);
    expect(await status(`/answers/${"k".repeat(300)}`, put("yes"))).toBe(400);
    expect(await status("/answers/q%3Aanything", put(["Python", "Go"]))).toBe(200);
  });

  it("is hidden while the flag is off", async () => {
    const { env } = await answersDb();
    expect((await routes(env)("/answers", undefined, { ...env, AUTO_APPLY: "off" })).status).toBe(404);
  });
});

describe("up-front answers when filling a page", () => {
  it("fill a shared question directly", async () => {
    const { env } = await answersDb();
    const relocate = [control("r", "radio", "Are you willing to relocate?", { options: ["Yes", "No"] })];
    const before = await planApplication(env, "user-1", { jobId: null, controls: relocate }, undefined);
    expect(before.needs.map((need) => need.ref)).toEqual(["r"]);

    await routes(env)("/answers/relocation", put("yes"));
    const after = await planApplication(env, "user-1", { jobId: null, controls: relocate }, undefined);
    expect(after.steps).toEqual([{ ref: "r", kind: "radio", value: "Yes" }]);
    expect(after.needs).toEqual([]);
  });

  it("reach Jev even when many learned answers are newer", async () => {
    const { env } = await answersDb();
    const call = routes(env);
    await call("/answers/office_days", put("3"));
    // 45 learned answers, all newer than the up-front one.
    await learnAnswers(env.DB, "user-1", Array.from({ length: 45 }, (_, index) =>
      control(`l${index}`, "text", `Question number ${index}`, { value: `Answer ${index}` })), new Date(Date.now() + 60_000));

    const question = [control("q", "radio", "This role requires 3 days a week in San Mateo. Are you able to do this?", { options: ["Yes", "No"] })];
    const seen: string[] = [];
    const plan = await planApplication(env, "user-1", { jobId: null, controls: question }, jevWhenFactsSay("office: Up to 3 (hybrid)", seen));
    expect(plan.steps).toEqual([{ ref: "q", kind: "radio", value: "Yes" }]);
    expect(seen[0]).toContain("Answers the applicant set for every application:");
    // The learned list stays capped and doesn't repeat the up-front answer.
    expect(seen[0].match(/- Question number/g)).toHaveLength(40);

    // Remote only: the same question goes back to the user.
    await call("/answers/office_days", put("0"));
    const remote = await planApplication(env, "user-1", { jobId: null, controls: question }, jevWhenFactsSay("office: Up to 3 (hybrid)"));
    expect(remote.needs.map((need) => need.ref)).toEqual(["q"]);
  });

  it("writes each up-front answer as a plain fact", () => {
    const facts = applicantFacts({
      profile: student,
      name: "",
      workAuthorization: null,
      answered: [],
      preferences: [{ label: "Earliest start date", value: describeCommonAnswer("start_date", "2027-06-01") }],
      job: null,
    });
    expect(facts).toContain("- Earliest start date: June 1, 2027");
    expect(describeCommonAnswer("office_days", "0")).toBe("None; fully remote roles only");
    expect(describeCommonAnswer("office_days", "5")).toBe("Any, including fully onsite (5 days a week)");
    expect(describeCommonAnswer("relocation", "no")).toBe("No");
  });
});

describe("up-front answer rules", () => {
  it("validates each common question's value", () => {
    expect(validCommonAnswer("office_days", "4")).toBe("4");
    expect(validCommonAnswer("office_days", "hybrid")).toBeNull();
    expect(validCommonAnswer("relocation", "yes")).toBe("yes");
    expect(validCommonAnswer("start_date", "2027-06-01")).toBe("2027-06-01");
    expect(validCommonAnswer("start_date", "Immediately")).toBe("Immediately");
    expect(validCommonAnswer("pronouns", "  ")).toBeNull();
  });

  it("drops saved answers that contradict a new work authorization", () => {
    const saved = [
      { key: "sponsorship", value: "yes" },
      { key: "work_authorization", value: "no" },
      { key: "relocation", value: "yes" },
    ];
    expect(effectiveAuthorization("authorized", saved)).toBe("sponsorship");
    expect(staleAuthorizationKeys("authorized", saved)).toEqual(["sponsorship", "work_authorization"]);
    // Needing sponsorship later says nothing against being authorized today.
    expect(staleAuthorizationKeys("sponsorship", [{ key: "work_authorization", value: "yes" }])).toEqual([]);
    expect(effectiveAuthorization("not_sure", [])).toBe("not_sure");
  });
});
