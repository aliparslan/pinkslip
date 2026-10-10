import { afterEach, describe, expect, it } from "bun:test";
import { Database, type SQLQueryBindings } from "bun:sqlite";
import worker from "../worker";
import type { Env } from "../worker/types";

const databases: Database[] = [];
afterEach(() => { for (const db of databases.splice(0)) db.close(); });

function fixture() {
  const sqlite = new Database(":memory:");
  databases.push(sqlite);
  sqlite.exec(`
    CREATE TABLE companies (id TEXT PRIMARY KEY, name TEXT, website TEXT, enabled INTEGER);
    CREATE TABLE jobs (
      id TEXT PRIMARY KEY, external_id TEXT, company_id TEXT, title TEXT, url TEXT, location TEXT,
      department TEXT, salary TEXT, posted_at TEXT, first_seen_at TEXT,
      evergreen INTEGER, closed_at TEXT, description TEXT
    );
    CREATE TABLE job_review_queue (job_id TEXT, state TEXT, admin_note TEXT);
    CREATE TABLE job_aliases (alias_id TEXT, job_id TEXT);
    CREATE TABLE job_features (
      job_id TEXT PRIMARY KEY, role_family TEXT, specialties_json TEXT, seniority TEXT NOT NULL,
      min_years INTEGER, max_years INTEGER, work_mode TEXT, countries_json TEXT,
      metro_areas_json TEXT, salary_min INTEGER, salary_max INTEGER, salary_currency TEXT,
      salary_period TEXT, sponsorship_available INTEGER, requires_advanced_degree INTEGER,
      requires_security_clearance INTEGER, qualification_requirements_json TEXT,
      classifier_version TEXT, confidence REAL
    );
    -- Every fixture job starts as a new-grad software role in Chicago, which a
    -- new guest's default profile matches; tests override.
    CREATE TRIGGER default_features AFTER INSERT ON jobs BEGIN
      INSERT INTO job_features VALUES (NEW.id, 'engineering', '["software_engineering"]', 'new_grad',
        NULL, NULL, 'onsite', '["US"]', '["chicago"]', NULL, NULL, NULL, NULL, NULL, 0, 0, NULL, 'test', 1);
    END;
    INSERT INTO companies VALUES ('company', 'Acme', 'example.com', 1), ('disabled', 'Hidden', 'hidden.example', 0);
    INSERT INTO jobs VALUES (
      'open', 'ext-open', 'company', 'Frontend Engineer', 'https://example.com/job', 'Chicago',
      'Engineering', '$120,000', datetime('now'), datetime('now'), 0, NULL, '<p>Build interfaces.</p>'
    );
    INSERT INTO job_aliases VALUES ('old-id', 'open');
  `);
  const queries: string[] = [];
  // Execute the route's actual SQL. This adapter intentionally rejects writes
  // and has no auth/user tables: anonymous reads must never touch either.
  const db = {
    prepare(sql: string) {
      queries.push(sql);
      if (!/^\s*SELECT\b/i.test(sql)) throw new Error("Public reads attempted a write");
      let values: SQLQueryBindings[] = [];
      const statement = {
        bind(...bindings: SQLQueryBindings[]) { values = bindings; return statement; },
        async first() { return sqlite.prepare(sql).get(...values); },
        async all() { return { results: sqlite.prepare(sql).all(...values), success: true, meta: {} }; },
      };
      return statement;
    },
  } as D1Database;
  const env = { DB: db } as Env;
  const request = (path: string, init?: RequestInit) =>
    worker.fetch(new Request(`https://pinkslip.work/api/v2${path}`, init), env);
  return { sqlite, queries, env, request };
}

describe("public job projection", () => {
  it("returns explicit catalog fields with no personal data, session work, or cookie", async () => {
    const { request, queries, env } = fixture();
    env.ACCESS_CODE = "invite-gate";
    const response = await request("/public/jobs", {
      headers: { Cookie: "psid=private-session; psaccess=private-access", Authorization: "Bearer private-token" },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toBeNull();
    const body = await response.json() as { jobs: Record<string, unknown>[] };
    expect(body.jobs).toHaveLength(1);
    expect(Object.keys(body.jobs[0]!).sort()).toEqual([
      "id", "title", "url", "location", "department", "salary", "posted_at",
      "first_seen_at", "evergreen", "company_name", "company_domain",
    ].sort());
    expect(body.jobs[0]!.evergreen).toBe(false);
    expect(queries).toHaveLength(1);
    expect(queries.join("\n")).not.toMatch(/auth_sessions|users|saved_jobs|applications|user_job_matches/);
  });

  it("keeps closed, disabled, stale, and unapproved jobs out of both list and detail", async () => {
    const { request, sqlite } = fixture();
    for (const id of ["closed", "disabled", "stale", "needs-review", "rejected", "approved", "evergreen", "undated"]) {
      sqlite.run(`INSERT INTO jobs SELECT ?, external_id, company_id, title, url, location, department,
        salary, posted_at, first_seen_at, evergreen, closed_at, description FROM jobs WHERE id = 'open'`, [id]);
    }
    sqlite.run("UPDATE jobs SET closed_at = datetime('now') WHERE id = 'closed'");
    sqlite.run("UPDATE jobs SET company_id = 'disabled' WHERE id = 'disabled'");
    sqlite.run("UPDATE jobs SET posted_at = '2020-01-01' WHERE id IN ('stale', 'evergreen')");
    sqlite.run("UPDATE jobs SET evergreen = 1 WHERE id = 'evergreen'");
    sqlite.run("UPDATE jobs SET posted_at = NULL WHERE id = 'undated'");
    sqlite.run(`INSERT INTO job_review_queue VALUES
      ('needs-review', 'needs_review', 'private note'),
      ('rejected', 'rejected', 'private note'), ('approved', 'approved', 'private note')`);
    const body = await (await request("/public/jobs")).json() as { jobs: { id: string }[] };
    expect(body.jobs.map((j) => j.id).sort()).toEqual(["approved", "evergreen", "open", "undated"]);
    for (const id of ["closed", "disabled", "stale", "needs-review", "rejected", "missing"]) {
      expect((await request(`/public/jobs/${id}`)).status).toBe(404);
    }
    const detail = await (await request("/public/jobs/old-id")).json();
    expect(detail).toMatchObject({ id: "open", description: "<p>Build interfaces.</p>" });
    expect(detail).not.toHaveProperty("admin_note");
  });

  it("lists only what a new guest's default feed would show", async () => {
    const { request, sqlite } = fixture();
    for (const id of ["senior", "senior-short", "clearance", "abroad", "no-description", "not-software"]) {
      sqlite.run(`INSERT INTO jobs SELECT ?, external_id, company_id, title, url, location, department,
        salary, posted_at, first_seen_at, evergreen, closed_at, description FROM jobs WHERE id = 'open'`, [id]);
    }
    sqlite.run("UPDATE job_features SET seniority = 'senior', min_years = 8 WHERE job_id = 'senior'");
    // A senior title that asks for few years is still an early-career catalog role.
    sqlite.run("UPDATE job_features SET seniority = 'senior', min_years = 2 WHERE job_id = 'senior-short'");
    sqlite.run("UPDATE job_features SET requires_security_clearance = 1 WHERE job_id = 'clearance'");
    sqlite.run("UPDATE jobs SET location = 'London, United Kingdom' WHERE id = 'abroad'");
    sqlite.run("UPDATE jobs SET description = '  ' WHERE id = 'no-description'");
    // Engineering, but not one of the software roles a new guest starts with.
    sqlite.run(`UPDATE job_features SET specialties_json = '["mechanical"]' WHERE job_id = 'not-software'`);
    sqlite.run("UPDATE jobs SET title = 'Senior Weld Engineer' WHERE id = 'not-software'");
    const body = await (await request("/public/jobs")).json() as { jobs: { id: string }[] };
    expect(body.jobs.map((j) => j.id).sort()).toEqual(["open", "senior-short"]);
    for (const id of ["senior", "clearance", "abroad", "no-description", "not-software"]) {
      expect((await request(`/public/jobs/${id}`)).status).toBe(404);
    }
  });

  it("bounds the public preview and does not accept private feed filters", async () => {
    const { request, sqlite } = fixture();
    for (let i = 0; i < 35; i++) sqlite.run(`INSERT INTO jobs SELECT ?, external_id, company_id, title,
      url, location, department, salary, posted_at, first_seen_at, evergreen,
      closed_at, description FROM jobs WHERE id = 'open'`, [`job-${i}`]);
    const body = await (await request("/public/jobs?saved=true&limit=1000")).json() as { jobs: unknown[] };
    expect(body.jobs).toHaveLength(30);
  });

  it("rejects writes and unknown public routes before session creation", async () => {
    const { request, queries } = fixture();
    for (const [path, method] of [["/public", "POST"], ["/public/", "POST"], ["/public/jobs", "POST"], ["/public/jobs/open", "DELETE"], ["/public/profile", "GET"]]) {
      const response = await request(path!, { method });
      expect(response.status).toBe(404);
      expect(response.headers.get("set-cookie")).toBeNull();
    }
    expect(queries).toHaveLength(0);
  });

  it("serves company logos behind the invite gate, like the catalog", async () => {
    const { request, env } = fixture();
    env.ACCESS_CODE = "invite-gate";
    // An invalid domain is rejected by the proxy itself (no upstream fetch),
    // which proves the request got past the access gate.
    const response = await request("/logo?domain=not-a-domain");
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "Invalid domain" });
  });

  it("leaves personal routes protected, including behind the invite gate", async () => {
    const { request, env, queries } = fixture();
    // The feed list itself is readable (as the catalog account; see auth tests).
    for (const path of ["/jobs/saved/list", "/profile", "/companies"]) {
      const response = await request(path);
      expect(response.status).toBe(401);
      expect(await response.json()).toMatchObject({ code: "session_required" });
    }
    env.ACCESS_CODE = "invite-gate";
    expect(await (await request("/profile")).json()).toMatchObject({ code: "access_required" });
    expect(queries).toHaveLength(0);
  });
});
