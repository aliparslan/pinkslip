import { Database } from "bun:sqlite";
import { afterEach, describe, expect, it } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { Hono } from "hono";
import {
  APPLICATION_STAGES,
  hasApplied,
  isApplicationStage,
  isEndingStage,
} from "../shared/application-stages";
import { mergeApplicationConflicts, mergedApplicationFields } from "@worker/applications";
import { ensureJobFeaturesForIds } from "@worker/job-features";
import applicationRoutes from "@worker/routes/applications";
import jobRoutes from "@worker/routes/jobs";
import type { Env, Variables } from "@worker/types";
import { sqliteD1 } from "./sqlite-d1";

const migrationsDir = new URL("../migrations/", import.meta.url).pathname;
const migrations = readdirSync(migrationsDir).filter((file) => file.endsWith(".sql")).sort();

function applyMigrations(sqlite: Database, filter: (file: string) => boolean) {
  for (const file of migrations.filter(filter)) sqlite.exec(readFileSync(`${migrationsDir}${file}`, "utf8"));
}

const databases: Database[] = [];
afterEach(() => {
  for (const db of databases.splice(0)) db.close();
});

describe("application stages", () => {
  it("knows the pipeline, its endings and what counts as applied", () => {
    expect(APPLICATION_STAGES).toEqual([
      "saved", "applied", "assessment", "interview", "offer", "rejected", "withdrawn", "ghosted",
    ]);
    expect(isApplicationStage("interview")).toBe(true);
    expect(isApplicationStage("Applied")).toBe(false);
    expect(hasApplied("saved")).toBe(false);
    expect(hasApplied("ghosted")).toBe(true);
    expect(isEndingStage("withdrawn")).toBe(true);
    expect(isEndingStage("offer")).toBe(false);
  });

  it("merges a guest's copy without losing that the user applied", () => {
    const side = (overrides: Partial<Parameters<typeof mergedApplicationFields>[0]>) => ({
      id: "x", stage: "saved" as const, notes: "", applied_at: null,
      stage_changed_at: "2026-10-01", created_at: "2026-10-01", updated_at: "2026-10-01",
      ...overrides,
    });
    // A later save on a guest device doesn't undo an application.
    expect(mergedApplicationFields(
      side({ stage: "saved", stage_changed_at: "2026-10-09", updated_at: "2026-10-09" }),
      side({ stage: "applied", applied_at: "2026-10-03", stage_changed_at: "2026-10-03", notes: "Referral from Sam" }),
    )).toEqual({
      stage: "applied", notes: "Referral from Sam", applied_at: "2026-10-03",
      stage_changed_at: "2026-10-03", created_at: "2026-10-01", updated_at: "2026-10-09",
    });
    // Between two applied copies, the later change wins and notes combine.
    expect(mergedApplicationFields(
      side({ stage: "interview", applied_at: "2026-10-04", stage_changed_at: "2026-10-08", notes: "Onsite Tuesday" }),
      side({ stage: "applied", applied_at: "2026-10-02", stage_changed_at: "2026-10-02", notes: "Referral" }),
    )).toMatchObject({ stage: "interview", applied_at: "2026-10-02", notes: "Referral\n\nOnsite Tuesday" });
  });
});

describe("guest application merge", () => {
  it("folds a guest's copy of a tracked job into the account's, keeping both timelines", async () => {
    const { sqlite, db } = sqliteD1();
    databases.push(sqlite);
    applyMigrations(sqlite, () => true);
    sqlite.run("INSERT INTO users (id) VALUES ('guest'), ('account')");
    sqlite.run("INSERT INTO companies (id, name, ats_type, ats_slug) VALUES ('co', 'Acme', 'greenhouse', 'acme-merge-test')");
    sqlite.run("INSERT INTO jobs (id, company_id, external_id, title, url) VALUES ('shared', 'co', 'shared', 'Engineer', 'https://example.com/shared'), ('guest-only', 'co', 'guest-only', 'Engineer', 'https://example.com/guest-only')");
    sqlite.run(`INSERT INTO applications (id, user_id, job_id, company_name, title, stage, notes, applied_at, stage_changed_at, created_at, updated_at) VALUES
      ('g1', 'guest', 'shared', 'Acme', 'Engineer', 'saved', '', NULL, '2026-10-09', '2026-10-09', '2026-10-09'),
      ('g2', 'guest', 'guest-only', 'Acme', 'Engineer', 'saved', '', NULL, '2026-10-09', '2026-10-09', '2026-10-09'),
      ('a1', 'account', 'shared', 'Acme', 'Engineer', 'applied', 'Referral', '2026-10-03', '2026-10-03', '2026-10-01', '2026-10-03')`);
    sqlite.run(`INSERT INTO application_events (id, application_id, stage, occurred_at) VALUES
      ('e1', 'g1', 'saved', '2026-10-09'), ('e2', 'a1', 'applied', '2026-10-03')`);

    await mergeApplicationConflicts(db, "guest", "account");

    expect(sqlite.query("SELECT id, user_id, stage, notes, applied_at FROM applications ORDER BY id").all()).toEqual([
      { id: "a1", user_id: "account", stage: "applied", notes: "Referral", applied_at: "2026-10-03" },
      // Not a conflict: the account merge moves it with the rest.
      { id: "g2", user_id: "guest", stage: "saved", notes: "", applied_at: null },
    ]);
    expect(sqlite.query("SELECT id FROM application_events WHERE application_id = 'a1' ORDER BY id").all())
      .toEqual([{ id: "e1" }, { id: "e2" }]);
  });
});

describe("application stages migration", () => {
  it("turns saved jobs into Saved applications and maps the early pipeline", () => {
    const sqlite = new Database(":memory:");
    databases.push(sqlite);
    applyMigrations(sqlite, (file) => file < "0089");
    sqlite.run("INSERT INTO users (id) VALUES ('u1')");
    sqlite.run("INSERT INTO companies (id, name, ats_type, ats_slug) VALUES ('co', 'Acme', 'greenhouse', 'acme-stage-test')");
    for (const id of ["only-saved", "saved-then-applied", "applied", "screen", "ghosted"]) {
      sqlite.run(`INSERT INTO jobs (id, company_id, external_id, title, url) VALUES ('${id}', 'co', '${id}', 'Engineer ${id}', 'https://example.com/${id}')`);
    }
    sqlite.run(`INSERT INTO saved_jobs (user_id, job_id, saved_at) VALUES
      ('u1', 'only-saved', '2026-09-01T00:00:00.000Z'),
      ('u1', 'saved-then-applied', '2026-09-02T00:00:00.000Z')`);
    sqlite.run(`INSERT INTO applications (id, user_id, job_id, company_name, title, stage, next, url, created_at, updated_at) VALUES
      ('a1', 'u1', 'saved-then-applied', 'Acme', 'Engineer', 'Applied', '', '', '2026-09-03T00:00:00.000Z', '2026-09-03T00:00:00.000Z'),
      ('a2', 'u1', 'applied', 'Acme', 'Engineer', 'Applied', '', '', '2026-09-04T00:00:00.000Z', '2026-09-04T00:00:00.000Z'),
      ('a3', 'u1', 'screen', 'Acme', 'Engineer', 'Screen', 'Call recruiter', '', '2026-09-05T00:00:00.000Z', '2026-09-07T00:00:00.000Z'),
      ('a4', 'u1', 'ghosted', 'Acme', 'Engineer', 'Ghosted', '', '', '2026-09-06T00:00:00.000Z', '2026-09-20T00:00:00.000Z')`);

    applyMigrations(sqlite, (file) => file === "0089_application_stages.sql");

    const rows = sqlite.query(
      "SELECT job_id, stage, notes, applied_at, stage_changed_at FROM applications ORDER BY job_id"
    ).all();
    expect(rows).toEqual([
      { job_id: "applied", stage: "applied", notes: "", applied_at: "2026-09-04T00:00:00.000Z", stage_changed_at: "2026-09-04T00:00:00.000Z" },
      { job_id: "ghosted", stage: "ghosted", notes: "", applied_at: "2026-09-06T00:00:00.000Z", stage_changed_at: "2026-09-20T00:00:00.000Z" },
      { job_id: "only-saved", stage: "saved", notes: "", applied_at: null, stage_changed_at: "2026-09-01T00:00:00.000Z" },
      { job_id: "saved-then-applied", stage: "applied", notes: "", applied_at: "2026-09-03T00:00:00.000Z", stage_changed_at: "2026-09-03T00:00:00.000Z" },
      { job_id: "screen", stage: "assessment", notes: "Call recruiter", applied_at: "2026-09-05T00:00:00.000Z", stage_changed_at: "2026-09-07T00:00:00.000Z" },
    ]);
    const timeline = (jobId: string) => sqlite.query(
      `SELECT e.stage, e.occurred_at FROM application_events e
       JOIN applications a ON a.id = e.application_id
       WHERE a.job_id = ? ORDER BY e.occurred_at`
    ).all(jobId);
    expect(timeline("saved-then-applied")).toEqual([
      { stage: "saved", occurred_at: "2026-09-02T00:00:00.000Z" },
      { stage: "applied", occurred_at: "2026-09-03T00:00:00.000Z" },
    ]);
    expect(timeline("screen")).toEqual([
      { stage: "applied", occurred_at: "2026-09-05T00:00:00.000Z" },
      { stage: "assessment", occurred_at: "2026-09-07T00:00:00.000Z" },
    ]);
    expect(sqlite.query("SELECT name FROM sqlite_master WHERE name IN ('saved_jobs', 'applications_staged')").all()).toEqual([]);
  });
});

describe("applications API", () => {
  async function setup() {
    const { sqlite, db } = sqliteD1();
    databases.push(sqlite);
    applyMigrations(sqlite, () => true);
    sqlite.exec("PRAGMA foreign_keys = ON");
    sqlite.run("INSERT INTO users (id) VALUES ('u1'), ('u2')");
    sqlite.run("INSERT INTO companies (id, name, ats_type, ats_slug, website) VALUES ('co', 'Acme', 'greenhouse', 'acme-api-test', 'acme.com')");
    for (const id of ["job-a", "job-b"]) {
      sqlite.run(`INSERT INTO jobs (id, company_id, external_id, title, url, location, posted_at)
        VALUES ('${id}', 'co', '${id}', 'Software Engineer', 'https://example.com/${id}', 'New York, NY', '${new Date().toISOString()}')`);
    }
    // The poller classifies every job it stores; the job lists join on that.
    await ensureJobFeaturesForIds(db, ["job-a", "job-b"]);
    const app = new Hono<{ Bindings: Env; Variables: Variables }>();
    app.use("*", async (c, next) => {
      c.set("userId", c.req.header("x-user") ?? "u1");
      c.set("sessionId", null);
      await next();
    });
    app.route("/jobs", jobRoutes);
    app.route("/applications", applicationRoutes);
    const call = async (path: string, init: RequestInit & { user?: string } = {}) => {
      const response = await app.request(path, {
        ...init,
        headers: { "content-type": "application/json", "x-user": init.user ?? "u1" },
      }, { DB: db } as Env);
      return { status: response.status, body: response.status === 204 ? null : await response.json() as any };
    };
    const patchJob = (id: string, body: object) => call(`/jobs/${id}`, { method: "PATCH", body: JSON.stringify(body) });
    const lists = async () => ({
      saved: (await call("/jobs/saved/list")).body.jobs.map((job: { id: string }) => job.id),
      applied: (await call("/jobs/applied/list")).body.jobs.map((job: { id: string }) => job.id),
    });
    const stages = () => sqlite.query("SELECT job_id, stage FROM applications ORDER BY job_id").all();
    const events = (jobId: string) => sqlite.query(
      "SELECT e.stage FROM application_events e JOIN applications a ON a.id = e.application_id WHERE a.job_id = ? ORDER BY e.occurred_at, e.rowid"
    ).all(jobId).map((row) => (row as { stage: string }).stage);
    return { sqlite, call, patchJob, lists, stages, events };
  }

  it("keeps today's saved and applied flags working, with each job in one place", async () => {
    const { patchJob, lists, stages, events } = await setup();

    const saved = await patchJob("job-a", { saved: true });
    expect(saved.body).toMatchObject({ saved: 1, applied: 0, application_stage: "saved" });
    expect(await lists()).toEqual({ saved: ["job-a"], applied: [] });

    const applied = await patchJob("job-a", { applied: true, dismissed: true });
    expect(applied.body).toMatchObject({ saved: 0, applied: 1, application_stage: "applied" });
    expect(applied.body.applied_at).toBeString();
    expect(await lists()).toEqual({ saved: [], applied: ["job-a"] });
    expect(events("job-a")).toEqual(["saved", "applied"]);

    // Unsaving an application past Saved doesn't remove it.
    await patchJob("job-a", { saved: false });
    expect(stages()).toEqual([{ job_id: "job-a", stage: "applied" }]);

    // "I didn't apply" returns a saved job to Saved, without the applied step.
    await patchJob("job-a", { applied: false, dismissed: false });
    expect(await lists()).toEqual({ saved: ["job-a"], applied: [] });
    expect(events("job-a")).toEqual(["saved"]);

    // Applying without saving starts at Applied; undoing it removes it.
    await patchJob("job-b", { applied: true, dismissed: true });
    expect(events("job-b")).toEqual(["applied"]);
    await patchJob("job-b", { applied: false, dismissed: false });
    expect(stages()).toEqual([{ job_id: "job-a", stage: "saved" }]);

    await patchJob("job-a", { saved: false });
    expect(stages()).toEqual([]);
  });

  it("moves an application through stages with a timeline and notes", async () => {
    const { call, lists, events } = await setup();

    const tracked = await call("/applications", { method: "POST", body: JSON.stringify({ job_id: "job-a", stage: "saved" }) });
    expect(tracked.status).toBe(200);
    expect(tracked.body).toMatchObject({
      job_id: "job-a", company_name: "Acme", title: "Software Engineer", stage: "saved", applied_at: null,
      job: { location: "New York, NY", closed_at: null, company_domain: "acme.com" },
    });
    const id = tracked.body.id as string;

    const interview = await call(`/applications/${id}`, { method: "PATCH", body: JSON.stringify({ stage: "interview", notes: "Onsite Tuesday" }) });
    expect(interview.body).toMatchObject({ stage: "interview", notes: "Onsite Tuesday" });
    expect(interview.body.applied_at).toBeString();
    expect(interview.body.events.map((event: { stage: string }) => event.stage)).toEqual(["saved", "interview"]);
    expect(await lists()).toEqual({ saved: [], applied: ["job-a"] });

    // Setting the same stage again records nothing.
    await call(`/applications/${id}`, { method: "PATCH", body: JSON.stringify({ stage: "interview" }) });
    expect(events("job-a")).toEqual(["saved", "interview"]);

    await call(`/applications/${id}`, { method: "PATCH", body: JSON.stringify({ stage: "offer" }) });
    expect((await call("/applications?stage=offer")).body.applications.map((app: { id: string }) => app.id)).toEqual([id]);
    expect((await call("/applications?stage=saved")).body.applications).toEqual([]);

    expect((await call(`/applications/${id}`, { method: "DELETE" })).status).toBe(204);
    expect((await call(`/applications/${id}`)).status).toBe(404);
    expect(events("job-a")).toEqual([]);
  });

  it("rejects bad input and other users' applications", async () => {
    const { call } = await setup();
    expect((await call("/applications", { method: "POST", body: JSON.stringify({ job_id: "job-a", stage: "Applied" }) })).status).toBe(400);
    expect((await call("/applications", { method: "POST", body: JSON.stringify({ stage: "saved" }) })).status).toBe(400);
    expect((await call("/applications", { method: "POST", body: JSON.stringify({ job_id: "missing", stage: "saved" }) })).status).toBe(404);
    expect((await call("/applications?stage=no_response")).status).toBe(400);

    const id = (await call("/applications", { method: "POST", body: JSON.stringify({ job_id: "job-a", stage: "applied" }) })).body.id;
    expect((await call(`/applications/${id}`, { method: "PATCH", body: "{}" })).status).toBe(400);
    expect((await call(`/applications/${id}`, { method: "PATCH", body: JSON.stringify({ notes: "x".repeat(10_001) }) })).status).toBe(400);

    expect((await call(`/applications/${id}`, { user: "u2" })).status).toBe(404);
    expect((await call(`/applications/${id}`, { method: "PATCH", user: "u2", body: JSON.stringify({ stage: "offer" }) })).status).toBe(404);
    expect((await call(`/applications/${id}`, { method: "DELETE", user: "u2" })).status).toBe(404);
    expect((await call("/applications", { user: "u2" })).body.applications).toEqual([]);
  });
});
