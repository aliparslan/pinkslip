import { describe, expect, it } from "bun:test";
import { Hono } from "hono";
import { compareClassification, jevDecision, rulesDecision, type JevAnswers } from "@worker/classification-comparison";
import metrics from "@worker/routes/metrics";
import type { JobFeatures } from "@worker/job-features";
import type { Env, Variables } from "@worker/types";
import { sqliteD1 } from "./sqlite-d1";

function answers(overrides: Record<string, string> = {}): JevAnswers {
  const choices: Record<string, string> = {
    us_eligibility: "yes",
    job_family: "software",
    min_years: "zero_to_three",
    min_years_exact: "1",
    required_education: "bachelor",
    doctorate_gate: "not_required",
    clearance_gate: "not_required",
    seniority: "early_career",
    work_mode: "hybrid",
    ...overrides,
  };
  return Object.fromEntries(Object.entries(choices).map(([name, choice]) =>
    [name, { choice, probabilities: { [choice]: 0.9 } }]));
}

const baseline: Partial<JobFeatures> = {
  role_family: "engineering",
  seniority: "new_grad",
  min_years: 1,
  work_mode: "hybrid",
  requires_security_clearance: false,
  qualification_requirements: { groups: [], experience_specified: true, doctorate_requirement: "none" },
};

describe("rulesDecision", () => {
  it("separates content rejections from staleness", () => {
    expect(rulesDecision("catalog_candidate")).toEqual({ decision: "include", reason: null });
    expect(rulesDecision("rejected_management")).toEqual({ decision: "exclude", reason: "management" });
    expect(rulesDecision("rejected_freshness")).toBeNull();
    expect(rulesDecision("needs_description")).toBeNull();
  });
});

describe("jevDecision", () => {
  it("applies the catalog's five-year ceiling", () => {
    expect(jevDecision(answers())).toEqual({ decision: "include", reason: null });
    expect(jevDecision(answers({ min_years_exact: "5", seniority: "experienced" })).decision).toBe("include");
    expect(jevDecision(answers({ min_years_exact: "6" }))).toEqual({ decision: "exclude", reason: "seniority" });
    expect(jevDecision(answers({ min_years_exact: "unspecified", seniority: "experienced" })).reason).toBe("seniority");
  });

  it("excludes on hard gates before calling anything unsure", () => {
    expect(jevDecision(answers({ us_eligibility: "no", job_family: "unknown" })).reason).toBe("location");
    expect(jevDecision(answers({ job_family: "hardware" })).reason).toBe("other_engineering_discipline");
    expect(jevDecision(answers({ clearance_gate: "required" })).reason).toBe("clearance");
    expect(jevDecision(answers({ job_family: "unknown" }))).toEqual({ decision: "unsure", reason: "job_family" });
  });
});

describe("compareClassification", () => {
  it("agrees when both sides include the job", () => {
    const result = compareClassification("catalog_candidate", baseline, answers());
    expect(result.kind).toBe("agree");
    expect(result.fields.filter((field) => field.mismatch)).toEqual([]);
  });

  it("flags a job only the rules let in, with the fields that differ", () => {
    const result = compareClassification("catalog_candidate", baseline, answers({ min_years_exact: "7", work_mode: "onsite" }));
    expect(result.kind).toBe("rules_only");
    expect(result.fields.filter((field) => field.mismatch).map((field) => field.field))
      .toEqual(["min_years_exact", "work_mode"]);
    expect(result.fields.find((field) => field.field === "work_mode")?.confidence).toBe(0.9);
  });

  it("flags a job only Jev would let in", () => {
    const result = compareClassification("rejected_location", baseline, answers());
    expect(result.kind).toBe("jev_only");
    expect(result.fields[0]).toMatchObject({ field: "us_eligibility", rules: "no", jev: "yes", mismatch: true });
  });

  it("doesn't compare location when the rules stopped at the title", () => {
    const result = compareClassification("rejected_non_technical_function",
      { ...baseline, role_family: "other" }, answers({ job_family: "nontechnical", us_eligibility: "no" }));
    expect(result.kind).toBe("agree");
    expect(result.fields[0]).toMatchObject({ rules: "not checked", mismatch: false });
  });

  it("leaves staleness and Jev's uncertainty out of disagreements", () => {
    expect(compareClassification("rejected_freshness", baseline, answers()).kind).toBe("not_comparable");
    expect(compareClassification("catalog_candidate", baseline, answers({ seniority: "unclear" })).kind).toBe("jev_unsure");
  });
});

describe("disagreement review routes", () => {
  async function app() {
    const { sqlite, db } = sqliteD1();
    sqlite.exec(`
      CREATE TABLE users (id TEXT PRIMARY KEY, role TEXT NOT NULL DEFAULT 'user');
      INSERT INTO users VALUES ('admin', 'admin');
      CREATE TABLE companies (id TEXT PRIMARY KEY, name TEXT NOT NULL);
      INSERT INTO companies VALUES ('acme', 'Acme');
      CREATE TABLE source_job_decisions (company_id TEXT, external_id TEXT, title TEXT, location TEXT, job_url TEXT);
      INSERT INTO source_job_decisions VALUES ('acme', 'one', 'Software Engineer', 'Austin, TX', 'https://acme.test/one');
      INSERT INTO source_job_decisions VALUES ('acme', 'two', 'Platform Engineer', 'Remote', 'https://acme.test/two');
      CREATE TABLE job_classification_shadow (
        cache_key TEXT PRIMARY KEY, company_id TEXT, external_id TEXT, reason TEXT, baseline_json TEXT,
        answers_json TEXT, truncated INTEGER DEFAULT 0, status TEXT, completed_at TEXT
      );
      CREATE TABLE classification_daily_budget (day TEXT PRIMARY KEY, calls INTEGER, reported_cost_usd REAL);
    `);
    sqlite.exec(await Bun.file(new URL("../migrations/0083_classification_reviews.sql", import.meta.url)).text());
    const insert = sqlite.query(`INSERT INTO job_classification_shadow VALUES (?, 'acme', ?, ?, ?, ?, 0, 'complete', ?)`);
    insert.run("k1", "one", "rejected_location", JSON.stringify(baseline), JSON.stringify(answers()), "2026-10-05T06:00:00Z");
    insert.run("k2", "two", "catalog_candidate", JSON.stringify(baseline), JSON.stringify(answers()), "2026-10-05T06:01:00Z");

    const wrapper = new Hono<{ Bindings: Env; Variables: Variables }>();
    wrapper.use("*", async (c, next) => {
      c.set("userId", "admin");
      c.set("sessionState", "authenticated");
      await next();
    });
    wrapper.route("/metrics", metrics);
    const env = { DB: db } as Env;
    return { sqlite, request: (path: string, init?: RequestInit) => wrapper.request(path, init, env) };
  }

  it("lists only disagreements and saves a verdict", async () => {
    const { request, sqlite } = await app();
    const listed = await (await request("/metrics/classification/disagreements")).json() as {
      counts: Record<string, number>; disagreements: Array<{ cache_key: string; kind: string; title: string; review: unknown }>;
    };
    expect(listed.counts).toMatchObject({ agree: 1, jev_only: 1 });
    expect(listed.disagreements.map((row) => [row.cache_key, row.kind, row.title, row.review]))
      .toEqual([["k1", "jev_only", "Software Engineer", null]]);

    const saved = await request("/metrics/classification/reviews/k1", {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ verdict: "jev", note: " Austin is in the US " }),
    });
    expect(saved.status).toBe(200);
    expect(sqlite.query("SELECT verdict, note, reviewed_by FROM classification_reviews").get())
      .toEqual({ verdict: "jev", note: "Austin is in the US", reviewed_by: "admin" });

    const relisted = await (await request("/metrics/classification/disagreements")).json() as { verdicts: Record<string, number> };
    expect(relisted.verdicts.jev).toBe(1);

    expect((await request("/metrics/classification/reviews/k1", { method: "DELETE" })).status).toBe(204);
    expect(sqlite.query("SELECT COUNT(*) AS count FROM classification_reviews").get()).toEqual({ count: 0 });
  });

  it("rejects unknown verdicts and comparisons", async () => {
    const { request } = await app();
    const put = (key: string, verdict: string) => request(`/metrics/classification/reviews/${key}`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ verdict }),
    });
    expect((await put("k1", "maybe")).status).toBe(400);
    expect((await put("missing", "rules")).status).toBe(404);
  });
});
