import { Database } from "bun:sqlite";
import { afterEach, describe, expect, it } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { Hono } from "hono";
import type { SearchResult } from "@worker/outreach/sourcing/linkedin-search";
import { sourceCompany, type Search } from "@worker/outreach/sourcing/source-company";
import {
  companiesByIds,
  companiesToSource,
  companyChoices,
  labelCandidate,
  recruiterReview,
  saveSourcing,
  setOwnerFormat,
} from "@worker/outreach/sourcing/store";
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
    expect(result.pattern).toEqual({ template: "{first}.{last}", votes: 2, total: 2, source: "pages" });
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

describe("sourceCompany, more carefully", () => {
  const companyPage = (title: string, slug: string, snippet: string): SearchResult => ({ title, link: `https://www.linkedin.com/company/${slug}`, snippet });
  const namesakeSearch: Search = async (query, page) => {
    if (query === 'site:linkedin.com/company "acme.example"') return [{ title: "Acme", link: "https://www.linkedin.com/company/acme-dev", snippet: "Website: https://acme.example" }];
    if (query === 'site:linkedin.com/company "Acme"') return [companyPage("Acme", "acme-dev", "Engineering tools."), companyPage("Acme", "getacme", "Dental software. Lehi, Utah.")];
    if (query.includes('"technical recruiter"') && page === 1) return [
      profile("Jordan Lee", "Senior Technical Recruiter at Acme", "Salt Lake City Metropolitan Area · Senior Technical Recruiter · Acme", "jordan-lee"),
      profile("Sam Rivera", "Technical Recruiter at Acme", "San Francisco Bay Area · Technical Recruiter · Acme", "sam-rivera"),
      profile("Pat Quinn", "GTM Recruiter at Acme", "San Francisco Bay Area · GTM Recruiter · Acme", "pat-quinn"),
    ];
    return fakeSearch(query, page);
  };

  it("checks which Acme it is, keeps tech recruiters, and prefers your format, then GitHub's", async () => {
    const offices = ["San Francisco, CA, US"];
    const pages = await sourceCompany("Acme", "acme.example", namesakeSearch, fakeLookup, { offices });
    expect(pages.linkedin).toEqual({ slug: "acme-dev", name: "Acme" });
    expect(pages.nameShared).toBe(true);
    const reasons = Object.fromEntries(pages.people.map((row) => [row.person.name?.display, row.reason]));
    expect(reasons["Jordan Lee"]).toBe("may work at another Acme");
    expect(reasons["Sam Rivera"]).toBeNull();
    expect(reasons["Pat Quinn"]).toBe("recruits outside tech");
    expect(pages.pattern?.source).toBe("pages");

    const github = async () => ({ org: "acme", template: "{f}{last}", votes: 4, total: 4 });
    const fromGithub = await sourceCompany("Acme", "acme.example", namesakeSearch, fakeLookup, { offices, github });
    expect(fromGithub.pattern).toEqual({ template: "{f}{last}", votes: 4, total: 4, source: "github" });
    expect(fromGithub.people.find((row) => row.person.name?.display === "Sam Rivera")).toMatchObject({
      emailGuess: "srivera@getacme.example", emailConfidence: "format from GitHub, 4 of 4",
    });

    const yours = await sourceCompany("Acme", "acme.example", namesakeSearch, fakeLookup, { offices, github, owner: { domain: "acme.example", pattern: "{first}" } });
    expect(yours.pattern?.source).toBe("owner");
    expect(yours.mail.domain).toBe("acme.example");
    expect(yours.people.find((row) => row.person.name?.display === "Sam Rivera")).toMatchObject({
      emailGuess: "sam@acme.example", emailConfidence: "risky: first-name addresses often belong to someone else",
    });
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

describe("choosing companies and their formats", () => {
  it("lists catalog companies with open jobs first, and picks the ones you chose", async () => {
    const { sqlite, db } = await setup();
    sqlite.run(`INSERT INTO jobs (id, company_id, external_id, title, url, location, first_seen_at, description) VALUES
      ('g1', 'globex', 'g1', 'Engineer', 'https://example.com/g1', 'Austin, TX', '2026-10-01', ''),
      ('g2', 'globex', 'g2', 'Engineer II', 'https://example.com/g2', 'Austin, TX', '2026-10-01', '')`);
    sqlite.run("UPDATE companies SET enabled = 1 WHERE id IN ('acme', 'acme-2', 'globex', 'nosite')");
    await saveSourcing(db, { id: "acme", name: "Acme", site: "acme.example" },
      await sourceCompany("Acme", "acme.example", fakeSearch, fakeLookup), "2026-10-14T10:00:00.000Z");
    const choices = await companyChoices(db);
    expect(choices.map((row) => [row.name, row.site, row.open_jobs, row.searched_at, row.kept, row.pattern, row.pattern_source])).toEqual([
      ["Globex", "globex.example", 2, null, 0, null, null],
      ["Acme", "acme.example", 0, "2026-10-14T10:00:00.000Z", 2, "{first}.{last}", "pages"],
      ["Acme", "acme.example", 0, null, 0, null, null],
    ]);
    expect((await companyChoices(db, { filter: "hiring" })).map((row) => row.id)).toEqual(["globex"]);
    expect((await companyChoices(db, { filter: "not_searched" })).map((row) => row.id)).toEqual(["globex", "acme-2"]);
    expect((await companyChoices(db, { q: "glob" })).map((row) => row.id)).toEqual(["globex"]);
    expect((await companiesByIds(db, ["globex", "nosite", "acme", "missing"])).map((row) => [row.id, row.site])).toEqual([
      ["globex", "globex.example"], ["acme", "acme.example"],
    ]);
  });

  it("rewrites every guess at a company from your format, and People follows", async () => {
    const { sqlite, db } = await setup();
    await saveSourcing(db, { id: "acme", name: "Acme", site: "acme.example" },
      await sourceCompany("Acme", "acme.example", fakeSearch, fakeLookup), "2026-10-14T10:00:00.000Z");
    const avery = (await recruiterReview(db)).candidates!.find((row) => row.name === "Avery Testerson")!;
    await labelCandidate(db, avery.id, { works_there: "yes" }, "2026-10-14T11:00:00.000Z");
    const { syncCandidateContact } = await import("@worker/outreach/contacts");
    await syncCandidateContact(db, avery.id);

    expect(await setOwnerFormat(db, "acme", "acme.example", "{f}{last}")).toBe(5);
    const review = await recruiterReview(db);
    expect(review.companies![0]).toMatchObject({ mail_domain: "acme.example", pattern: "{f}{last}", pattern_source: "owner", site: "acme.example" });
    expect(review.candidates!.find((row) => row.name === "Avery Testerson")).toMatchObject({
      email_guess: "atesterson@acme.example", email_confidence: "format from you",
    });
    // Left-out people get the new guess but no confidence, as from a search.
    expect(review.candidates!.find((row) => row.name === "Rowan Placeholder")).toMatchObject({ email_guess: "rplaceholder@acme.example", email_confidence: null });
    expect(sqlite.query("SELECT email, status FROM company_contacts ORDER BY email").all()).toEqual([
      { email: "atesterson@acme.example", status: "listed" },
      { email: "avery.testerson@getacme.example", status: "hidden" },
    ]);
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

  it("lists companies to choose and saves your format", async () => {
    const { db, call } = await app();
    await saveSourcing(db, { id: "acme", name: "Acme", site: "acme.example" },
      await sourceCompany("Acme", "acme.example", fakeSearch, fakeLookup), "2026-10-14T10:00:00.000Z");
    expect((await call("/recruiters/companies", { user: "someone" })).status).toBe(403);
    expect((await call("/recruiters/companies?filter=has_format")).body.companies.map((row: { id: string }) => row.id)).toEqual(["acme"]);
    const put = (body: unknown, id = "acme") => call(`/recruiters/companies/${id}/format`, { method: "PUT", body: JSON.stringify(body) });
    expect((await put({ domain: "acme.example", template: "{first}-{last}" })).status).toBe(400);
    expect((await put({ template: "{first}" })).status).toBe(400);
    expect((await put({ domain: "acme.example", template: "{first}" }, "missing")).status).toBe(404);
    expect((await put({ domain: "https://www.acme.example/", template: "{first}" })).body).toEqual({ domain: "acme.example", template: "{first}", rewritten: 5 });
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
