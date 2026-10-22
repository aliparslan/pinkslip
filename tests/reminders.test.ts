import { Database } from "bun:sqlite";
import { afterEach, describe, expect, it } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { trackJob, updateApplication } from "@worker/applications";
import { createGuestSession } from "@worker/auth";
import worker from "@worker/index";
import { deliverDueNotifications } from "@worker/notifications";
import { plannedReminders, queueDueReminders, type ReminderApplication } from "@worker/reminders";
import type { NotificationPayload, PushResult } from "@worker/push";
import type { Env, PushSubscriptionRow } from "@worker/types";
import { sqliteD1 } from "./sqlite-d1";

const migrationsDir = new URL("../migrations/", import.meta.url).pathname;
const migrationFiles = readdirSync(migrationsDir).filter((name) => name.endsWith(".sql")).sort();
const databases: Database[] = [];
afterEach(() => {
  for (const db of databases.splice(0)) db.close();
});

const NY = "America/New_York";

function application(overrides: Partial<ReminderApplication>): ReminderApplication {
  return {
    id: "a1",
    user_id: "u1",
    job_id: "z1",
    company_name: "Stripe",
    title: "Software Engineer",
    stage: "interview",
    stage_date: null,
    applied_at: "2026-10-01T15:00:00.000Z",
    ...overrides,
  };
}

const summary = (reminders: ReturnType<typeof plannedReminders>) =>
  reminders.map((reminder) => [reminder.type, reminder.at.toISOString(), reminder.title, reminder.timeSensitive]);

describe("plannedReminders", () => {
  it("reminds about an interview with a time the evening before and an hour before", () => {
    // Noon in New York.
    expect(summary(plannedReminders(application({ stage_date: "2026-10-22T16:00:00.000Z" }), NY))).toEqual([
      ["interview_evening_before", "2026-10-21T22:00:00.000Z", "Interview with Stripe tomorrow at 12:00 PM", false],
      ["interview_hour_before", "2026-10-22T15:00:00.000Z", "Interview with Stripe in an hour, at 12:00 PM", true],
    ]);
  });

  it("reminds about an interview with only a day the evening before and at 8 that morning", () => {
    expect(summary(plannedReminders(application({ stage_date: "2026-10-22" }), NY))).toEqual([
      ["interview_evening_before", "2026-10-21T22:00:00.000Z", "Interview with Stripe tomorrow", false],
      ["interview_morning", "2026-10-22T12:00:00.000Z", "Interview with Stripe today", false],
    ]);
  });

  it("uses the person's own time zone", () => {
    const [evening] = plannedReminders(application({ stage_date: "2026-10-22" }), "America/Los_Angeles");
    expect(evening!.at.toISOString()).toBe("2026-10-22T01:00:00.000Z");
  });

  it("reminds about an assessment the day before at 9 and the morning it's due", () => {
    expect(summary(plannedReminders(application({ stage: "assessment", stage_date: "2026-10-22" }), NY))).toEqual([
      ["assessment_day_before", "2026-10-21T13:00:00.000Z", "Stripe assessment due tomorrow", false],
      ["assessment_morning", "2026-10-22T12:00:00.000Z", "Stripe assessment due today", false],
    ]);
  });

  it("reminds about an offer 3 days before and the morning before, the second time-sensitive", () => {
    expect(summary(plannedReminders(application({ stage: "offer", stage_date: "2026-10-24" }), NY))).toEqual([
      ["offer_three_days", "2026-10-21T13:00:00.000Z", "Reply to Stripe's offer by Saturday", false],
      ["offer_morning_before", "2026-10-23T12:00:00.000Z", "Reply to Stripe's offer by tomorrow", true],
    ]);
  });

  it("doesn't nudge about no word from a company (owner, 2026-10-22)", () => {
    expect(plannedReminders(application({ stage: "applied", stage_date: "2026-10-20" }), NY)).toEqual([]);
    expect(plannedReminders(application({ stage: "applied" }), NY)).toEqual([]);
  });

  it("has nothing for stages that take no reminder", () => {
    expect(plannedReminders(application({ stage: "saved", stage_date: null }), NY)).toEqual([]);
    expect(plannedReminders(application({ stage: "rejected", stage_date: null }), NY)).toEqual([]);
  });
});

function setup() {
  const { sqlite, db } = sqliteD1();
  databases.push(sqlite);
  for (const file of migrationFiles) sqlite.exec(readFileSync(`${migrationsDir}${file}`, "utf8"));
  sqlite.exec("PRAGMA foreign_keys = ON");
  sqlite.run("INSERT INTO users (id, time_zone) VALUES ('u1', 'America/New_York'), ('u2', NULL)");
  sqlite.run(`INSERT INTO companies (id, name, ats_type, ats_slug, website)
    VALUES ('zephyr', 'Zephyr Labs', 'greenhouse', 'zephyrlabs-test', 'https://zephyrlabs.example')`);
  sqlite.run(`INSERT INTO jobs (id, company_id, external_id, title, url, location, salary)
    VALUES ('z1', 'zephyr', '9100001', 'Software Engineer, New Grad', 'https://example.com/z1', 'New York, NY', '$120,000 - $140,000')`);
  sqlite.run("INSERT INTO push_subscriptions (id, endpoint, p256dh, auth, user_id, platform) VALUES ('p', 'token', '', '', 'u1', 'ios')");
  const env = { DB: db } as Env;
  const log = () => sqlite.query("SELECT kind, title, body, url, passive, status FROM notification_log ORDER BY created_at, rowid").all() as Array<Record<string, unknown>>;
  const appId = () => (sqlite.query("SELECT id FROM applications WHERE job_id = 'z1'").get() as { id: string }).id;
  return { sqlite, db, env, log, appId };
}

describe("queueDueReminders", () => {
  it("writes a due reminder to the stream once and queues its push", async () => {
    const { sqlite, db, env, log, appId } = setup();
    await trackJob(db, "u1", "z1", "interview");
    await updateApplication(db, "u1", appId(), { stage_date: "2026-10-22T16:00:00.000Z" });

    expect(await queueDueReminders(env, new Date("2026-10-21T21:59:00.000Z"))).toBe(0);
    expect(await queueDueReminders(env, new Date("2026-10-21T22:00:30.000Z"))).toBe(1);
    expect(await queueDueReminders(env, new Date("2026-10-21T22:05:00.000Z"))).toBe(0);

    expect(log()).toEqual([{
      kind: "interview_reminder",
      title: "Interview with Zephyr Labs tomorrow at 12:00 PM",
      body: "Software Engineer, New Grad",
      url: `/applications/${appId()}`,
      passive: 1,
      status: "scheduled",
    }]);
    expect(sqlite.query("SELECT kind FROM activity WHERE kind = 'reminder_due'").all()).toEqual([{ kind: "reminder_due" }]);
  });

  it("follows the application as it is: a new date reminds again, a moved stage doesn't", async () => {
    const { db, env, log, appId } = setup();
    await trackJob(db, "u1", "z1", "interview");
    await updateApplication(db, "u1", appId(), { stage_date: "2026-10-22" });
    await queueDueReminders(env, new Date("2026-10-21T22:01:00.000Z"));

    await updateApplication(db, "u1", appId(), { stage_date: "2026-10-23" });
    expect(await queueDueReminders(env, new Date("2026-10-22T22:01:00.000Z"))).toBe(1);

    await updateApplication(db, "u1", appId(), { stage: "offer" });
    expect(await queueDueReminders(env, new Date("2026-10-23T12:01:00.000Z"))).toBe(0);
    expect(log().map((row) => row.title)).toEqual(["Interview with Zephyr Labs tomorrow", "Interview with Zephyr Labs tomorrow"]);
  });

  it("lets a late tick catch up, but not after the moment has passed", async () => {
    const { db, env, appId } = setup();
    await trackJob(db, "u1", "z1", "interview");
    await updateApplication(db, "u1", appId(), { stage_date: "2026-10-22T16:00:00.000Z" });
    // Twenty minutes late for the hour-before: still worth it. After noon: not.
    expect(await queueDueReminders(env, new Date("2026-10-22T15:20:00.000Z"))).toBe(1);
    const fresh = setup();
    await trackJob(fresh.db, "u1", "z1", "interview");
    await updateApplication(fresh.db, "u1", fresh.appId(), { stage_date: "2026-10-22T16:00:00.000Z" });
    expect(await queueDueReminders(fresh.env, new Date("2026-10-22T16:10:00.000Z"))).toBe(0);
  });

  it("sends interview reminders whatever the cap, the hour-before through Focus", async () => {
    const { sqlite, db, env, appId } = setup();
    for (const [index, hoursAgo] of [3, 2, 1].entries()) {
      const sentAt = new Date(Date.parse("2026-10-22T15:00:00.000Z") - hoursAgo * 3_600_000).toISOString();
      sqlite.run(
        `INSERT INTO notification_log (id, user_id, kind, dedupe_key, title, body, url, passive, status, scheduled_for, created_at, sent_at)
         VALUES (?, 'u1', 'saved_job_closed', ?, 't', 'b', '/', 1, 'sent', ?, ?, ?)`,
        [`old-${index}`, `old-${index}`, sentAt, sentAt, sentAt]
      );
    }
    await trackJob(db, "u1", "z1", "interview");
    await updateApplication(db, "u1", appId(), { stage_date: "2026-10-22T16:00:00.000Z" });
    const now = new Date("2026-10-22T15:00:30.000Z");
    await queueDueReminders(env, now);
    const sent: NotificationPayload[] = [];
    const stats = await deliverDueNotifications(env, now, async (_sub: PushSubscriptionRow, payload: NotificationPayload): Promise<PushResult> => {
      sent.push(payload);
      return { ok: true, status: 200 };
    });
    expect(stats).toMatchObject({ sent: 1, held: 0 });
    expect(sent[0]).toMatchObject({ title: "Interview with Zephyr Labs in an hour, at 12:00 PM", timeSensitive: true, kind: "interview_reminder" });
  });
});

describe("applications", () => {
  async function call(env: Env, db: D1Database, path: string, init: RequestInit = {}) {
    const session = await createGuestSession(db, "u1");
    return worker.fetch(
      new Request(`https://pinkslip.work${path}`, { ...init, headers: { authorization: `Bearer ${session.id}`, "content-type": "application/json" } }),
      env,
      { waitUntil() {}, passThroughOnException() {} } as unknown as ExecutionContext
    );
  }

  it("keeps the company's domain and the pay when the job leaves the catalog", async () => {
    const { sqlite, db, appId } = setup();
    await trackJob(db, "u1", "z1", "applied");
    const id = appId();
    sqlite.run("DELETE FROM jobs WHERE id = 'z1'");
    const row = sqlite.query("SELECT job_id, company_domain, salary FROM applications WHERE id = ?").get(id);
    expect(row).toEqual({ job_id: null, company_domain: "https://zephyrlabs.example", salary: "$120,000 - $140,000" });
  });

  it("adds an application for a job that isn't in Pinkslip, with the catalog's logo", async () => {
    const { sqlite, db, env } = setup();
    const response = await call(env, db, "/api/v2/applications", {
      method: "POST",
      body: JSON.stringify({ company: "zephyr labs", title: "Platform Engineer", url: "https://zephyr.example/careers/42", stage: "applied" }),
    });
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      job_id: null,
      company_name: "zephyr labs",
      title: "Platform Engineer",
      url: "https://zephyr.example/careers/42",
      stage: "applied",
      company_domain: "https://zephyrlabs.example",
      events: [expect.objectContaining({ stage: "applied", source: "user" })],
    });
    expect(sqlite.query("SELECT kind, stage FROM activity").all()).toEqual([{ kind: "stage_moved", stage: "applied" }]);
  });

  it("asks for a company, a title and a real link", async () => {
    const { db, env } = setup();
    for (const body of [
      { company: "", title: "Engineer", stage: "applied" },
      { company: "Acme", title: "", stage: "applied" },
      { company: "Acme", title: "Engineer", url: "javascript:alert(1)", stage: "applied" },
      { company: "Acme", title: "Engineer", stage: "dreaming" },
    ]) {
      const response = await call(env, db, "/api/v2/applications", { method: "POST", body: JSON.stringify(body) });
      expect(response.status).toBe(400);
    }
  });

  it("moves a step to when it happened, with the applied date following", async () => {
    const { db, env, appId } = setup();
    await trackJob(db, "u1", "z1", "applied");
    const id = appId();
    const detail = await (await call(env, db, `/api/v2/applications/${id}`)).json() as { events: Array<{ id: string; stage: string }> };
    const applied = detail.events.find((event) => event.stage === "applied")!;

    const response = await call(env, db, `/api/v2/applications/${id}/events/${applied.id}`, {
      method: "PATCH",
      body: JSON.stringify({ occurred_at: "2026-10-02" }),
    });
    expect(response.status).toBe(200);
    // Midday in New York.
    expect(await response.json()).toMatchObject({
      applied_at: "2026-10-02T16:00:00.000Z",
      stage_changed_at: "2026-10-02T16:00:00.000Z",
      events: [expect.objectContaining({ id: applied.id, occurred_at: "2026-10-02T16:00:00.000Z" })],
    });

    const future = await call(env, db, `/api/v2/applications/${id}/events/${applied.id}`, {
      method: "PATCH",
      body: JSON.stringify({ occurred_at: "2099-01-01T00:00:00Z" }),
    });
    expect(future.status).toBe(400);
    const missing = await call(env, db, `/api/v2/applications/${id}/events/nope`, {
      method: "PATCH",
      body: JSON.stringify({ occurred_at: "2026-10-02" }),
    });
    expect(missing.status).toBe(404);
  });
});

describe("the snapshot backfill", () => {
  it("copies each tracked job's domain and pay onto its application", () => {
    const { sqlite } = sqliteD1();
    databases.push(sqlite);
    for (const file of migrationFiles.filter((name) => name < "0096")) sqlite.exec(readFileSync(`${migrationsDir}${file}`, "utf8"));
    sqlite.run("INSERT INTO users (id) VALUES ('u1')");
    sqlite.run(`INSERT INTO companies (id, name, ats_type, ats_slug, website) VALUES ('zephyr', 'Zephyr Labs', 'greenhouse', 'zephyrlabs-test', 'https://zephyrlabs.example')`);
    sqlite.run(`INSERT INTO jobs (id, company_id, external_id, title, url, location, salary) VALUES ('z1', 'zephyr', '1', 'SWE', 'https://e.com', 'NY', '$100k')`);
    sqlite.run(`INSERT INTO applications (id, user_id, job_id, company_name, title, stage, stage_changed_at, created_at, updated_at)
      VALUES ('a1', 'u1', 'z1', 'Zephyr Labs', 'SWE', 'saved', 'x', 'x', 'x')`);
    sqlite.exec(readFileSync(`${migrationsDir}0096_application_snapshots.sql`, "utf8"));
    expect(sqlite.query("SELECT company_domain, salary FROM applications").get()).toEqual({ company_domain: "https://zephyrlabs.example", salary: "$100k" });
  });
});
