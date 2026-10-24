import { Database } from "bun:sqlite";
import { afterEach, describe, expect, it } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { createGuestSession } from "@worker/auth";
import worker from "@worker/index";
import { companyPeopleCount, listCompanyPeople, recruiterScore, syncCandidateContact } from "@worker/outreach/contacts";
import { companyChoices, labelCandidate, scoreReview } from "@worker/outreach/sourcing/store";
import type { Env } from "@worker/types";
import { recruiterTypesFromTitle, withRecruiterLabels, type RecruiterLabels } from "../shared/recruiter-review";
import { SEARCH_PROFILE_VERSION } from "../shared/search-profile";
import { sqliteD1 } from "./sqlite-d1";

// Every person and company here is made up.

const migrationsDir = new URL("../migrations/", import.meta.url).pathname;
const databases: Database[] = [];
afterEach(() => {
  for (const db of databases.splice(0)) db.close();
});

const NOW = new Date("2026-10-24T15:00:00Z");

function setup(overrides: Partial<Env> = {}) {
  const { sqlite, db } = sqliteD1();
  databases.push(sqlite);
  for (const file of readdirSync(migrationsDir).filter((name) => name.endsWith(".sql")).sort()) {
    sqlite.exec(readFileSync(`${migrationsDir}${file}`, "utf8"));
  }
  sqlite.exec("PRAGMA foreign_keys = ON");
  sqlite.run("UPDATE companies SET enabled = 0");
  sqlite.run(`INSERT INTO companies (id, name, ats_type, ats_slug, website, enabled) VALUES
    ('acme', 'Acme Test', 'greenhouse', 'acme-test', 'https://acme.example', 1),
    ('globex', 'Globex Test', 'greenhouse', 'globex-test', 'https://globex.example', 1),
    ('initech', 'Initech Test', 'greenhouse', 'initech-test', 'https://initech.example', 1)`);
  for (const [id, company] of [["a1", "acme"], ["g1", "globex"], ["i1", "initech"]]) {
    sqlite.run("INSERT INTO jobs (id, company_id, external_id, title, url, location) VALUES (?, ?, ?, 'Software Engineer', '', 'Remote')", [id, company, id]);
  }
  sqlite.run("INSERT INTO users (id, name, role) VALUES ('seeker', 'Sam', 'user'), ('other', '', 'user'), ('boss', '', 'admin')");
  const mail: Array<{ to: string; text?: string }> = [];
  const env = {
    DB: db,
    EMAIL: { send: async (message: { to: string; text?: string }) => { mail.push(message); } },
    EMAIL_FROM_ADDRESS: "login@pinkslip.work",
    ...overrides,
  } as unknown as Env;
  const candidate = (id: string, title: string, fields: { company?: string; works?: string | null } = {}) => sqlite.run(
    `INSERT INTO recruiter_candidates (id, company_id, profile_url, name, headline, current_title, kind, employer_evidence, email_guess, works_there, found_at, seen_at)
     VALUES (?, ?, ?, ?, ?, ?, 'recruiter', 'current employer', ?, ?, ?, ?)`,
    [id, fields.company ?? "acme", `https://www.linkedin.com/in/${id}`, `Person ${id}`, `${title} at Acme`, title,
      `${id}@acme.example`, fields.works === undefined ? "yes" : fields.works, NOW.toISOString(), NOW.toISOString()],
  );
  const listed = (id: string) => (sqlite.query("SELECT status FROM company_contacts WHERE candidate_id = ?").get(id) as { status: string } | null)?.status ?? null;
  return { sqlite, db, env, mail, candidate, listed };
}

describe("the types a title suggests", () => {
  it("reads who they hire, what for, their job and agency from the title", () => {
    expect(recruiterTypesFromTitle("University Recruiter, Tech")).toEqual({ hires: ["interns", "new_grads"], hires_for: ["engineering"], job: "recruiter", agency: false });
    expect(recruiterTypesFromTitle("Senior Technical Recruiter")).toEqual({ hires: ["experienced"], hires_for: ["engineering"], job: "recruiter", agency: false });
    expect(recruiterTypesFromTitle("Contract Technical Recruiter").agency).toBe(true);
    expect(recruiterTypesFromTitle("Recruiting Coordinator").job).toBe("coordinator");
    expect(recruiterTypesFromTitle("Technical Sourcer").job).toBe("sourcer");
    expect(recruiterTypesFromTitle("Head of Talent").job).toBe("leads");
    expect(recruiterTypesFromTitle("Early Talent Programs Manager")).toMatchObject({ hires: ["interns", "new_grads"], job: "programs" });
    expect(recruiterTypesFromTitle("Research Recruiter").hires_for).toEqual(["research"]);
    expect(recruiterTypesFromTitle("Talent Acquisition Partner")).toMatchObject({ job: "recruiter", hires_for: ["everything"] });
    expect(recruiterTypesFromTitle("People Partner").job).toBe("not_recruiting");
    expect(recruiterTypesFromTitle("International Recruiter").hires).toEqual(["experienced"]);
  });
});

describe("labelling types in Admin", () => {
  it("shows the suggestion until confirmed, keeps answers, and reads older single answers", async () => {
    const { db, candidate } = setup();
    candidate("c1", "University Recruiter");
    const before = await labelCandidate(db, "c1", {}, NOW.toISOString());
    expect(before).toMatchObject({ types: { hires: ["interns", "new_grads"], job: "recruiter" }, types_confirmed: false });
    const confirmed = await labelCandidate(db, "c1", { job: "recruiter", hires: ["new_grads"], hires_for: ["engineering"], agency: false }, NOW.toISOString());
    expect(confirmed).toMatchObject({ types: { hires: ["new_grads"], hires_for: ["engineering"], job: "recruiter", agency: false }, types_confirmed: true });
    expect(confirmed!.reviewed_at).toBe(NOW.toISOString());
    // Leaving a type out keeps it; null goes back to the suggestion.
    expect((await labelCandidate(db, "c1", { agency: true }, NOW.toISOString()))!.types).toMatchObject({ hires: ["new_grads"], agency: true });
    expect((await labelCandidate(db, "c1", { hires: null }, NOW.toISOString()))!.types.hires).toEqual(["interns", "new_grads"]);
    // An older Admin build's one answer fills the job it implies.
    candidate("c2", "Talent Partner");
    expect(await labelCandidate(db, "c2", { works_there: "yes", actual_role: "not_recruiter" }, NOW.toISOString()))
      .toMatchObject({ types: { job: "not_recruiting" }, types_confirmed: true });
  });

  it("moves the screen on as the server will answer", async () => {
    const { db, candidate } = setup();
    candidate("c1", "University Recruiter");
    let row = (await labelCandidate(db, "c1", {}, NOW.toISOString()))!;
    // L2's Save, then L1's answer with the types as shown, then a cleared type.
    const steps: RecruiterLabels[] = [
      { hires: ["new_grads"] },
      { works_there: "yes", ...row.types, hires: ["new_grads"], agency: true },
      { hires_for: null },
    ];
    for (const labels of steps) {
      const expected = withRecruiterLabels(row, labels);
      row = (await labelCandidate(db, "c1", labels, NOW.toISOString()))!;
      expect({ works_there: expected.works_there, types: expected.types, types_confirmed: expected.types_confirmed })
        .toEqual({ works_there: row.works_there, types: row.types, types_confirmed: row.types_confirmed });
    }
  });

  it("scores how often the title's guess held, for people who work there", async () => {
    const { db, candidate } = setup();
    for (const id of ["right", "changed", "gone", "open"]) candidate(id, "University Recruiter");
    const as = (id: string, labels: RecruiterLabels) => labelCandidate(db, id, labels, NOW.toISOString());
    const guess = recruiterTypesFromTitle("University Recruiter");
    await as("right", { works_there: "yes", ...guess });
    await as("changed", { works_there: "yes", ...guess, hires: ["experienced"] });
    await as("gone", { works_there: "no", ...guess });
    const rows = await Promise.all(["right", "changed", "gone", "open"].map((id) => as(id, {})));
    expect(scoreReview(rows.map((row) => row!)).titles).toEqual({ right: 1, labelled: 2 });
  });

  it("carries the older answers over in the migration", () => {
    const { sqlite } = setup();
    const migration = readFileSync(`${migrationsDir}0104_recruiter_types.sql`, "utf8");
    const backfill = migration.slice(migration.indexOf("UPDATE"));
    sqlite.run(`INSERT INTO recruiter_candidates (id, company_id, profile_url, name, kind, employer_evidence, found_at, seen_at, actual_role)
      VALUES ('old1', 'acme', 'u1', 'A', 'other', 'none', 'x', 'x', 'early_career'), ('old2', 'acme', 'u2', 'B', 'other', 'none', 'x', 'x', 'not_recruiter')`);
    sqlite.exec(backfill);
    expect(sqlite.query("SELECT id, hires, job FROM recruiter_candidates WHERE id LIKE 'old%' ORDER BY id").all()).toEqual([
      { id: "old1", hires: "[\"interns\",\"new_grads\"]", job: "recruiter" },
      { id: "old2", hires: null, job: "not_recruiting" },
    ]);
  });
});

describe("People", () => {
  it("lists only people in recruiting and not through an agency", async () => {
    const { db, candidate, listed } = setup();
    candidate("rec", "Technical Recruiter");
    candidate("contract", "Contract Technical Recruiter");
    candidate("hr", "People Partner");
    for (const id of ["rec", "contract", "hr"]) await syncCandidateContact(db, id, NOW);
    expect([listed("rec"), listed("contract"), listed("hr")]).toEqual(["listed", null, null]);
    // The owner's answer wins over the title.
    await labelCandidate(db, "contract", { agency: false }, NOW.toISOString());
    await syncCandidateContact(db, "contract", NOW);
    expect(listed("contract")).toBe("listed");
    await labelCandidate(db, "rec", { job: "not_recruiting" }, NOW.toISOString());
    await syncCandidateContact(db, "rec", NOW);
    expect(listed("rec")).toBe("hidden");
  });

  it("puts the person's level and field first, then recruiters ahead of coordinators", async () => {
    const { db, sqlite, candidate } = setup();
    candidate("senior", "Senior Technical Recruiter");
    candidate("campus", "University Recruiter, Engineering");
    candidate("coord", "University Recruiting Coordinator");
    candidate("biz", "University Recruiter, Business");
    for (const id of ["senior", "campus", "coord", "biz"]) await syncCandidateContact(db, id, NOW);
    const order = async () => (await listCompanyPeople(db, "acme", "seeker")).map((person) => person.name);
    const profile = (levels: string[]) => JSON.stringify({ version: SEARCH_PROFILE_VERSION, target_levels: levels, roles: ["software_engineering"] });
    sqlite.run("INSERT INTO user_search_profiles (user_id, profile_json) VALUES ('seeker', ?)", [profile(["new_grad"])]);
    expect(await order()).toEqual(["Person campus", "Person coord", "Person biz", "Person senior"]);
    sqlite.run("UPDATE user_search_profiles SET profile_json = ? WHERE user_id = 'seeker'", [profile(["early_career"])]);
    expect((await order())[0]).toBe("Person senior");
    expect(recruiterScore({ hires: ["experienced"], hires_for: ["everything"], job: "leads", agency: false }, { levels: ["experienced"], fields: ["engineering"] })).toBe(1);
  });

  it("shows guests how many, never who, and signed-in people the list", async () => {
    const { db, sqlite, env, mail, candidate } = setup({ OUTREACH: "on" });
    candidate("rec", "Technical Recruiter");
    candidate("campus", "University Recruiter");
    candidate("contract", "Contract Recruiter");
    for (const id of ["rec", "campus", "contract"]) await syncCandidateContact(db, id, NOW);
    expect(await companyPeopleCount(db, "acme")).toBe(2);
    const ctx = { waitUntil() {}, passThroughOnException() {} } as unknown as ExecutionContext;
    const call = (token: string, path: string, init: RequestInit = {}) => worker.fetch(new Request(`https://pinkslip.work${path}`, {
      ...init,
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json", "x-pinkslip-client": "ios" },
    }), env, ctx);
    const guest = await createGuestSession(db);
    const asGuest = await call(guest.id, "/api/v2/outreach/companies/acme/people");
    expect(asGuest.status).toBe(200);
    expect(await asGuest.json() as unknown).toEqual({ people: [], count: 2, signed_in: false });
    // Signing in shows the people.
    await call(guest.id, "/api/v2/auth/email/code/start", { method: "POST", body: JSON.stringify({ email: "sam@example.com" }) });
    const code = mail.at(-1)?.text?.match(/code is (\d{6})/)?.[1] ?? "";
    const { native_token: token } = await (await call(guest.id, "/api/v2/auth/email/code/verify", { method: "POST", body: JSON.stringify({ email: "sam@example.com", code }) })).json() as { native_token: string };
    const signedIn = await (await call(token, "/api/v2/outreach/companies/acme/people")).json() as { people: Array<{ name: string }>; count: number; signed_in: boolean };
    expect(signedIn.count).toBe(2);
    expect(signedIn.signed_in).toBe(true);
    expect(signedIn.people.map((person) => person.name).sort()).toEqual(["Person campus", "Person rec"]);
    expect(sqlite.query("SELECT COUNT(*) AS n FROM company_contacts").get()).toEqual({ n: 2 });
  });

  it("tells the app whether a guest gets the count", async () => {
    const features = async (outreach: string) => {
      const { db, env } = setup({ OUTREACH: outreach });
      const guest = await createGuestSession(db);
      const response = await worker.fetch(new Request("https://pinkslip.work/api/v2/me", {
        headers: { authorization: `Bearer ${guest.id}`, "x-pinkslip-client": "ios" },
      }), env, { waitUntil() {}, passThroughOnException() {} } as unknown as ExecutionContext);
      return ((await response.json()) as { features: { outreach_enabled: boolean; outreach_people_enabled: boolean } }).features;
    };
    expect(await features("on")).toMatchObject({ outreach_enabled: false, outreach_people_enabled: true });
    expect(await features("admin")).toMatchObject({ outreach_enabled: false, outreach_people_enabled: false });
  });

  it("stays hidden from everyone while outreach is admin-only", async () => {
    const { db, env } = setup({ OUTREACH: "admin" });
    const guest = await createGuestSession(db);
    const response = await worker.fetch(new Request("https://pinkslip.work/api/v2/outreach/companies/acme/people", {
      headers: { authorization: `Bearer ${guest.id}`, "x-pinkslip-client": "ios" },
    }), env, { waitUntil() {}, passThroughOnException() {} } as unknown as ExecutionContext);
    expect(response.status).toBe(404);
  });
});

describe("the confirm queue", () => {
  it("orders companies by how many people are there, leaving out ones with recruiters and admins' own looks", async () => {
    const { db, sqlite, candidate } = setup();
    const look = (user: string, job: string, at = NOW.toISOString()) =>
      sqlite.run("INSERT INTO viewed_jobs (user_id, job_id, viewed_at) VALUES (?, ?, ?)", [user, job, at]);
    look("seeker", "g1");
    look("other", "g1");
    look("seeker", "i1");
    look("boss", "i1");
    look("boss", "a1");
    look("other", "a1", "2026-08-01T00:00:00Z");
    sqlite.run(`INSERT INTO applications (id, user_id, job_id, company_name, title, url, stage, notes, stage_changed_at, created_at, updated_at)
      VALUES ('app1', 'other', 'i1', 'Initech Test', 'Software Engineer', '', 'saved', '', ?, ?, ?)`, [NOW.toISOString(), NOW.toISOString(), NOW.toISOString()]);
    expect((await companyChoices(db, { filter: "wanted" }, NOW)).map((choice) => [choice.id, choice.wanted, choice.listed]))
      .toEqual([["globex", 2, 0], ["initech", 2, 0]]);
    candidate("rec", "Technical Recruiter", { company: "globex" });
    await syncCandidateContact(db, "rec", NOW);
    expect((await companyChoices(db, { filter: "wanted" }, NOW)).map((choice) => choice.id)).toEqual(["initech"]);
  });
});
