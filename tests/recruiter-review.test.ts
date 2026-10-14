import { Database } from "bun:sqlite";
import { afterEach, describe, expect, it } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { Hono } from "hono";
import type { SearchResult } from "@worker/outreach/sourcing/linkedin-search";
import { sourceCompany, type Search } from "@worker/outreach/sourcing/source-company";
import { companiesToSource, labelCandidate, recruiterReview, saveSourcing } from "@worker/outreach/sourcing/store";
import recruiterRoutes from "@worker/routes/recruiters";
import type { Env, Variables } from "@worker/types";
import { sqliteD1 } from "./sqlite-d1";

// Every person and company here is made up.

const migrationsDir = new URL("../migrations/", import.meta.url).pathname;
const databases: Database[] = [];
afterEach(() => {
  for (const db of databases.splice(0)) db.close();
});

const profile = (name: string, headline: string, subtitle: string, slug: string): SearchResult => ({
  title: `${name} - ${headline} | LinkedIn`,
  link: `https://www.linkedin.com/in/${slug}`,
  snippet: `${headline} · Experience: ${subtitle.split(" · ").at(-1)}`,
  subtitle,
});

const RESULTS = {
  early: [
    profile("Avery Testerson", "University Recruiter at Acme", "Austin, Texas, United States · University Recruiter · Acme", "avery-testerson"),
    profile("Rowan Placeholder", "Campus Recruiting @ Acme", "Dublin, County Dublin, Ireland · Campus Recruiter · Acme", "rowanp"),
    profile("Kit Examplar", "University Recruiting", "New York, New York, United States · Campus Recruiter · Globex", "kit-ex"),
  ],
  recruiters: [
    profile("Imani Fakename", "Technical Recruiter @ Acme", "Seattle, Washington, United States · Technical Recruiter · Acme", "imani-f"),
    profile("Liam Testly", "Software Engineer at Acme", "Seattle, Washington, United States · Software Engineer · Acme", "liam"),
  ],
  format: [
    { title: "Acme Email Format", link: "https://rocketreach.co/acme", snippet: "The most common Acme email format is [first].[last] (ex. jane.doe@getacme.example), used by 80%." },
    { title: "Acme email formats", link: "https://leadiq.com/acme", snippet: "Acme's most common email format is First.Last@getacme.example (77%)." },
    { title: "Acme formats", link: "https://mailmo.io/acme", snippet: "The most common email format for Acme is {first}." },
  ],
};

const fakeSearch: Search = async (query, page) => {
  if (page > 1) return [];
  if (query.endsWith("email format")) return RESULTS.format;
  if (query.includes('"university recruiter"')) return RESULTS.early;
  return RESULTS.recruiters;
};
const fakeLookup = async (domain: string) => (domain === "getacme.example" ? ["aspmx.l.google.com"] : []);

describe("sourceCompany", () => {
  it("keeps current US recruiters, learns the mail domain and pattern, and guesses addresses", async () => {
    const result = await sourceCompany("Acme", "acme.example", fakeSearch, fakeLookup);
    expect(result.mail).toEqual({ domain: "getacme.example", exchanges: ["aspmx.l.google.com"], source: "format pages" });
    expect(result.provider).toBe("google");
    // mailmo.io is ignored, so both remaining sources agree.
    expect(result.pattern).toEqual({ template: "{first}.{last}", votes: 2, total: 2 });
    expect(result.people.map((row) => [row.person.name?.display, row.kind, row.reason])).toEqual([
      ["Avery Testerson", "early_career", null],
      ["Imani Fakename", "technical", null],
      ["Rowan Placeholder", "early_career", "based outside the US (Dublin, County Dublin, Ireland)"],
      ["Kit Examplar", "early_career", "works at Globex"],
      ["Liam Testly", "other", "not a recruiter"],
    ]);
    expect(result.people[0]).toMatchObject({
      employerEvidence: "current employer",
      emailGuess: "avery.testerson@getacme.example",
      emailConfidence: "format probable",
    });
    expect(result.people[2]?.emailConfidence).toBeNull();
  });
});

async function setup() {
  const { sqlite, db } = sqliteD1();
  databases.push(sqlite);
  for (const file of readdirSync(migrationsDir).filter((name) => name.endsWith(".sql")).sort()) {
    sqlite.exec(readFileSync(`${migrationsDir}${file}`, "utf8"));
  }
  sqlite.exec("PRAGMA foreign_keys = ON");
  // Migrations seed the real catalog; only the made-up companies take part.
  sqlite.run("UPDATE companies SET enabled = 0");
  sqlite.run("INSERT INTO users (id, role) VALUES ('admin', 'admin'), ('someone', 'user')");
  sqlite.run(`INSERT INTO companies (id, name, ats_type, ats_slug, website) VALUES
    ('acme', 'Acme', 'greenhouse', 'acme-test', 'https://www.acme.example'),
    ('acme-2', 'Acme', 'custom', 'acme-careers-test', 'http://acme.example'),
    ('globex', 'Globex', 'ashby', 'globex-test', 'globex.example'),
    ('nosite', 'No Site', 'lever', 'nosite-test', '')`);
  return { sqlite, db };
}

describe("recruiter review storage", () => {
  it("picks unsourced companies with a website, once per site", async () => {
    const { db } = await setup();
    const picked = await companiesToSource(db, 10);
    expect(picked.map((company) => company.site).sort()).toEqual(["acme.example", "globex.example"]);
    await saveSourcing(db, picked.find((company) => company.site === "acme.example")!,
      await sourceCompany("Acme", "acme.example", fakeSearch, fakeLookup), "2026-10-14T10:00:00.000Z");
    expect((await companiesToSource(db, 10)).map((company) => company.site)).toEqual(["globex.example"]);
  });

  it("saves everyone found, keeps labels across runs, and scores the labels", async () => {
    const { db } = await setup();
    const acme = { id: "acme", name: "Acme", site: "acme.example" };
    const result = await sourceCompany("Acme", "acme.example", fakeSearch, fakeLookup);
    await saveSourcing(db, acme, result, "2026-10-14T10:00:00.000Z");

    let review = await recruiterReview(db);
    expect(review.companies).toMatchObject([{ company: "Acme", mail_domain: "getacme.example", pattern: "{first}.{last}", pattern_votes: 2 }]);
    expect(review.candidates?.map((row) => row.name)).toEqual([
      "Avery Testerson", "Imani Fakename", "Rowan Placeholder", "Kit Examplar", "Liam Testly",
    ]);
    const [avery, imani, , kit] = review.candidates!;

    const half = await labelCandidate(db, avery!.id, { works_there: "yes" }, "2026-10-14T11:00:00.000Z");
    expect(half).toMatchObject({ works_there: "yes", actual_role: null, reviewed_at: null });
    expect(await labelCandidate(db, avery!.id, { actual_role: "early_career" }, "2026-10-14T11:01:00.000Z"))
      .toMatchObject({ works_there: "yes", actual_role: "early_career", reviewed_at: "2026-10-14T11:01:00.000Z" });
    await labelCandidate(db, imani!.id, { works_there: "no", actual_role: "early_career" }, "2026-10-14T11:02:00.000Z");
    await labelCandidate(db, kit!.id, { works_there: "yes", actual_role: "early_career" }, "2026-10-14T11:03:00.000Z");
    expect(await labelCandidate(db, "missing", { works_there: "yes" }, "2026-10-14T11:04:00.000Z")).toBeNull();

    // A second run refreshes what the search says and keeps the labels.
    await saveSourcing(db, acme, result, "2026-10-15T10:00:00.000Z");
    review = await recruiterReview(db);
    expect(review.candidates).toHaveLength(5);
    expect(review.candidates![0]).toMatchObject({ name: "Avery Testerson", works_there: "yes", actual_role: "early_career" });
    expect(review.score).toEqual({
      works_there: { yes: 1, labelled: 2 },
      role: { right: 1, labelled: 2 },
      early_career: { right: 1, labelled: 1 },
      wrongly_left_out: 1,
      left_out_labelled: 1,
    });

    // Clearing a label un-reviews the person.
    expect(await labelCandidate(db, avery!.id, { works_there: null }, "2026-10-15T11:00:00.000Z"))
      .toMatchObject({ works_there: null, reviewed_at: null });
  });
});

describe("recruiter review routes", () => {
  async function app(env: Partial<Env> = {}) {
    const { sqlite, db } = await setup();
    const hono = new Hono<{ Bindings: Env; Variables: Variables }>();
    hono.use("*", async (c, next) => {
      c.set("userId", c.req.header("x-user") ?? "admin");
      c.set("sessionState", "authenticated");
      c.set("sessionId", null);
      await next();
    });
    hono.route("/recruiters", recruiterRoutes);
    const call = async (path: string, init: RequestInit & { user?: string } = {}) => {
      const response = await hono.request(path, {
        ...init,
        headers: { "content-type": "application/json", "x-user": init.user ?? "admin" },
      }, { DB: db, ...env } as Env);
      return { status: response.status, body: await response.json() as any };
    };
    return { sqlite, db, call };
  }

  it("is for admins only", async () => {
    const { call } = await app();
    expect((await call("/recruiters", { user: "someone" })).status).toBe(403);
  });

  it("says whether runs can start, and refuses one without a key", async () => {
    const { call } = await app();
    expect((await call("/recruiters")).body).toMatchObject({ available: true, can_run: false, candidates: [] });
    expect((await call("/recruiters/run", { method: "POST", body: "{}" })).status).toBe(503);
  });

  it("runs sourcing on unsourced companies and records failures", async () => {
    const { call } = await app({ SERPER_API_KEY: "test-key" });
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith("https://cloudflare-dns.com/")) {
        const domain = new URL(url).searchParams.get("name")!;
        return Response.json({ Status: 0, Answer: (await fakeLookup(domain)).map((host) => ({ type: 15, data: `10 ${host}.` })) });
      }
      const { q, page } = JSON.parse(String(init?.body)) as { q: string; page: number };
      if (q.includes('"Globex"') || q.startsWith("Globex")) return new Response("Unauthorized", { status: 403 });
      return Response.json({ organic: await fakeSearch(q, page) });
    }) as typeof fetch;
    try {
      const run = await call("/recruiters/run", { method: "POST", body: JSON.stringify({ count: 10 }) });
      expect(run.status).toBe(200);
      expect(run.body.runs.sort((a: { company: string }, b: { company: string }) => a.company.localeCompare(b.company))).toEqual([
        { company: "Acme", kept: 2, left_out: 3, error: null },
        { company: "Globex", kept: 0, left_out: 0, error: expect.stringContaining("Search failed (403)") },
      ]);
      const review = await call("/recruiters");
      expect(review.body.candidates).toHaveLength(5);
      expect(review.body.companies.find((company: { company: string }) => company.company === "Globex").error)
        .toContain("Search failed");
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  it("validates and saves labels", async () => {
    const { db, call } = await app();
    await saveSourcing(db, { id: "acme", name: "Acme", site: "acme.example" },
      await sourceCompany("Acme", "acme.example", fakeSearch, fakeLookup), "2026-10-14T10:00:00.000Z");
    const [first] = (await call("/recruiters")).body.candidates;
    expect((await call(`/recruiters/candidates/${first.id}`, { method: "PUT", body: JSON.stringify({ works_there: "maybe" }) })).status).toBe(400);
    expect((await call(`/recruiters/candidates/${first.id}`, { method: "PUT", body: JSON.stringify({ actual_role: "ceo" }) })).status).toBe(400);
    expect((await call("/recruiters/candidates/missing", { method: "PUT", body: JSON.stringify({ works_there: "yes" }) })).status).toBe(404);
    const saved = await call(`/recruiters/candidates/${first.id}`, {
      method: "PUT", body: JSON.stringify({ works_there: "yes", actual_role: "early_career" }),
    });
    expect(saved.body).toMatchObject({ id: first.id, company: "Acme", works_there: "yes", actual_role: "early_career", kind_from_snippet: false });
    expect(saved.body.reviewed_at).toBeString();
  });
});
