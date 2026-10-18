import { Database } from "bun:sqlite";
import { afterEach, describe, expect, it } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { buildToday, markTodaySeen, needsYouCount } from "@worker/activity";
import { buildApnsBody } from "@worker/apns";
import { trackJob, updateApplication } from "@worker/applications";
import { createGuestSession } from "@worker/auth";
import { handleInboundEmail } from "@worker/email/handler";
import { undoInboundEmail } from "@worker/email/process";
import { getOrCreateInbox } from "@worker/inbox";
import worker from "@worker/index";
import { remindDueFollowUps } from "@worker/outreach/reminders";
import { queueSavedJobClosings } from "@worker/notification-scheduler";
import { deliverDueNotifications } from "@worker/notifications";
import type { NotificationPayload, PushResult } from "@worker/push";
import type { Env, PushSubscriptionRow } from "@worker/types";
import { sqliteD1 } from "./sqlite-d1";

const migrationsDir = new URL("../migrations/", import.meta.url).pathname;
const migrationFiles = readdirSync(migrationsDir).filter((name) => name.endsWith(".sql")).sort();
const databases: Database[] = [];
afterEach(() => {
  for (const db of databases.splice(0)) db.close();
});

function mime(headers: Record<string, string>, body: string): string {
  return `${Object.entries(headers).map(([key, value]) => `${key}: ${value}`).join("\r\n")}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${body}`;
}

function message(to: string, raw: string): ForwardableEmailMessage {
  const bytes = new TextEncoder().encode(raw);
  const headers = new Headers();
  for (const line of raw.split("\r\n\r\n")[0]!.split("\r\n")) {
    const index = line.indexOf(":");
    headers.append(line.slice(0, index), line.slice(index + 1).trim());
  }
  return { from: "forwarder@gmail.com", to, headers, raw: new Response(bytes).body!, rawSize: bytes.length } as unknown as ForwardableEmailMessage;
}

const greenhouse = (subject: string, body: string, messageId: string) => mime({
  From: "Zephyr Labs <no-reply@us.greenhouse-mail.io>",
  To: "alex@gmail.com",
  Subject: subject,
  "Message-ID": `<${messageId}@greenhouse>`,
  Date: "Mon, 12 Oct 2026 15:04:00 +0000",
}, body);

function migrate(sqlite: Database, files = migrationFiles) {
  for (const file of files) sqlite.exec(readFileSync(`${migrationsDir}${file}`, "utf8"));
}

function seedCatalog(sqlite: Database) {
  sqlite.run("INSERT INTO users (id) VALUES ('u1')");
  sqlite.run(`INSERT INTO companies (id, name, ats_type, ats_slug, website)
    VALUES ('zephyr', 'Zephyr Labs', 'greenhouse', 'zephyrlabs-test', 'https://zephyrlabs.example')`);
  for (const [id, title, externalId] of [
    ["z1", "Software Engineer, New Grad", "9100001"],
    ["z2", "Software Engineer", "9100002"],
    ["z3", "Data Scientist", "9100003"],
    ["z4", "Product Designer", "9100004"],
  ]) {
    sqlite.run(`INSERT INTO jobs (id, company_id, external_id, title, url, location)
      VALUES ('${id}', 'zephyr', '${externalId}', '${title}', 'https://boards.greenhouse.io/zephyrlabs-test/jobs/${externalId}', 'New York, NY')`);
  }
}

async function setup() {
  const { sqlite, db } = sqliteD1();
  databases.push(sqlite);
  migrate(sqlite);
  sqlite.exec("PRAGMA foreign_keys = ON");
  seedCatalog(sqlite);
  const env = { DB: db } as Env;
  const inbox = await getOrCreateInbox(db, "u1");
  const send = (raw: string) => handleInboundEmail(message(inbox.address, raw), env);
  const log = () => sqlite.query("SELECT kind, title, body, url, passive FROM notification_log ORDER BY created_at, rowid").all();
  const activity = () => sqlite.query("SELECT kind, source, stage FROM activity ORDER BY occurred_at, rowid").all();
  const applicationId = (jobId: string) => (sqlite.query("SELECT id FROM applications WHERE job_id = ?").get(jobId) as { id: string }).id;
  return { sqlite, db, env, send, log, activity, applicationId };
}

describe("the Activity stream", () => {
  it("writes a stage move next to every timeline entry, and a date when one is set", async () => {
    const { db, activity, applicationId } = await setup();
    await trackJob(db, "u1", "z1", "saved");
    await trackJob(db, "u1", "z1", "interview");
    await updateApplication(db, "u1", applicationId("z1"), { stage_date: "2026-10-22" });
    await updateApplication(db, "u1", applicationId("z1"), { stage_date: "2026-10-22" });

    expect(activity()).toEqual([
      { kind: "stage_moved", source: "user", stage: "saved" },
      { kind: "stage_moved", source: "user", stage: "interview" },
      { kind: "date_set", source: "user", stage: "interview" },
    ]);
  });

  it("starts N3 from an email's move, time-sensitive for an interview, and skips receipts", async () => {
    const { send, log, applicationId } = await setup();
    await send(greenhouse(
      "Thank you for applying to Zephyr Labs",
      "Thanks for applying for the Software Engineer, New Grad position.\nhttps://boards.greenhouse.io/zephyrlabs-test/jobs/9100001",
      "receipt-1"
    ));
    expect(log()).toEqual([]);

    await send(greenhouse("Next steps for Software Engineer, New Grad", "We'd like to invite you to a phone screen.", "invite-1"));
    expect(log()).toEqual([{
      kind: "application_moved",
      title: "Zephyr Labs",
      body: "Interview invite · Software Engineer, New Grad",
      url: `/applications/${applicationId("z1")}`,
      passive: 0,
    }]);
  });

  it("starts N4 when an email matches several applications", async () => {
    const { db, send, log, activity } = await setup();
    await trackJob(db, "u1", "z2", "applied");
    await trackJob(db, "u1", "z3", "applied");
    await send(greenhouse("Your application to Zephyr Labs", "Unfortunately, we will not be moving forward with your application.", "reject-1"));

    expect(activity().at(-1)).toEqual({ kind: "email_needs_choice", source: "email", stage: null });
    expect(log()).toEqual([{ kind: "which_application", title: "Zephyr Labs", body: "Which application is this?", url: "/today", passive: 1 }]);
  });

  it("forgets an email's move when the email is undone", async () => {
    const { sqlite, db, send } = await setup();
    await trackJob(db, "u1", "z2", "saved");
    await send(greenhouse("Interview for Software Engineer", "We'd like to invite you to a phone screen.", "invite-2"));
    const emailId = (sqlite.query("SELECT id FROM inbound_emails").get() as { id: string }).id;
    expect(sqlite.query("SELECT COUNT(*) AS count FROM activity WHERE inbound_email_id = ?").get(emailId)).toEqual({ count: 1 });

    await undoInboundEmail(db, "u1", emailId);
    expect(sqlite.query("SELECT COUNT(*) AS count FROM activity WHERE inbound_email_id = ?").get(emailId)).toEqual({ count: 0 });
  });
});

describe("Today", () => {
  async function busyDay() {
    const harness = await setup();
    const { sqlite, db, send, applicationId } = harness;
    const now = new Date();
    // Needs you: an offer, an interview without a date.
    await trackJob(db, "u1", "z1", "offer");
    await trackJob(db, "u1", "z2", "interview");
    // What changed: an email moved an application (receipt, then a rejection).
    await send(greenhouse(
      "Thanks for applying",
      "Thank you for applying to the Data Scientist role.\nhttps://boards.greenhouse.io/zephyrlabs-test/jobs/9100003",
      "receipt-3"
    ));
    // Coming up: a hear-back date two days out, and one past the two weeks.
    await trackJob(db, "u1", "z4", "applied");
    const soon = new Date(now.getTime() + 2 * 86_400_000).toISOString().slice(0, 10);
    await updateApplication(db, "u1", applicationId("z4"), { stage_date: soon });
    // A follow-up that's due.
    sqlite.run("INSERT INTO company_contacts (id, company_id, email, name, source, created_at) VALUES ('cc', 'zephyr', 'jane@zephyr.example', 'Jane Doe', 'test', ?)", [now.toISOString()]);
    sqlite.run("INSERT INTO outreach_threads (id, user_id, company_id, job_id, contact_id, status, created_at, updated_at) VALUES ('t1', 'u1', 'zephyr', 'z1', 'cc', 'active', ?, ?)", [now.toISOString(), now.toISOString()]);
    sqlite.run("INSERT INTO outreach_messages (id, thread_id, step, subject, body, status, due_at, created_at, updated_at) VALUES ('m1', 't1', 1, 'Following up', 'Hi', 'scheduled', ?, ?, ?)",
      [new Date(now.getTime() - 60_000).toISOString(), now.toISOString(), now.toISOString()]);
    return harness;
  }

  it("applies the app's rules across applications, emails and threads", async () => {
    const { db, applicationId } = await busyDay();
    const today = await buildToday(db, "u1");

    expect(today.needs_you.map((entry) => entry.kind).sort()).toEqual(["follow_up_due", "interview_date", "offer_reply"]);
    expect(today.changed).toEqual([expect.objectContaining({ kind: "email_step", stage: "applied", new: true })]);
    expect(today.coming_up).toEqual([expect.objectContaining({ kind: "upcoming_step", key: `upcoming-${applicationId("z4")}` })]);
    expect(today.badge).toBe(3);
    expect(await needsYouCount(db, "u1")).toBe(3);
    expect(today.tracking).toBe(4);
  });

  it("clears Needs you on its own when the thing is resolved", async () => {
    const { db, sqlite, applicationId } = await busyDay();
    await updateApplication(db, "u1", applicationId("z2"), { stage_date: "2026-10-30T15:00:00.000Z" });
    sqlite.run("UPDATE outreach_messages SET status = 'sent', sent_at = ?", [new Date().toISOString()]);
    expect((await buildToday(db, "u1")).needs_you.map((entry) => entry.kind)).toEqual(["offer_reply"]);
  });

  it("marks What changed seen for every device once Today is opened", async () => {
    const { db } = await busyDay();
    await markTodaySeen(db, "u1", new Date(Date.now() + 1000));
    const today = await buildToday(db, "u1");
    expect(today.changed.map((entry) => "new" in entry && entry.new)).toEqual([false]);
    expect(today.seen_at).not.toBeNull();
  });

  it("shows a saved job the company closed in What changed and queues N9 from it", async () => {
    const { sqlite, db, env, log } = await setup();
    await trackJob(db, "u1", "z3", "saved");
    sqlite.run("UPDATE jobs SET closed_at = ?, missed_polls = 2 WHERE id = 'z3'", [new Date(Date.now() - 3_600_000).toISOString()]);
    expect(await queueSavedJobClosings(env)).toBe(1);

    expect((await buildToday(db, "u1")).changed).toEqual([expect.objectContaining({ kind: "saved_job_closed" })]);
    expect(log()).toEqual([expect.objectContaining({ kind: "saved_job_closed", title: "Zephyr Labs" })]);
  });

  it("records a follow-up coming due and starts N10 from it", async () => {
    const { sqlite, env, log, activity } = await busyDay();
    expect(await remindDueFollowUps(env)).toEqual({ reminded: 1, queued: 1 });
    expect(activity().at(-1)).toMatchObject({ kind: "follow_up_due" });
    expect(log().at(-1)).toMatchObject({ kind: "follow_up", title: "Follow up with Zephyr Labs" });
    expect(sqlite.query("SELECT COUNT(*) AS count FROM activity WHERE kind = 'follow_up_due'").get()).toEqual({ count: 1 });
  });

  it("is one request, and opening it marks it seen", async () => {
    const { db, env } = await busyDay();
    const session = await createGuestSession(db, "u1");
    const call = (path: string, init: RequestInit = {}) => worker.fetch(
      new Request(`https://pinkslip.work${path}`, { ...init, headers: { authorization: `Bearer ${session.id}` } }),
      env,
      { waitUntil() {}, passThroughOnException() {} } as unknown as ExecutionContext
    );
    const today = await (await call("/api/v2/today")).json() as { badge: number; seen_at: string | null };
    expect(today).toMatchObject({ badge: 3, seen_at: null });
    const seen = await (await call("/api/v2/today/seen", { method: "POST" })).json() as { seen_at: string };
    expect((await (await call("/api/v2/today")).json() as { seen_at: string }).seen_at).toBe(seen.seen_at);
  });
});

describe("the badge", () => {
  it("rides every push with Needs you's count", async () => {
    const { sqlite, db, env } = await setup();
    sqlite.run("INSERT INTO push_subscriptions (id, endpoint, p256dh, auth, user_id, platform) VALUES ('p', 'token', '', '', 'u1', 'ios')");
    await trackJob(db, "u1", "z1", "offer");
    await trackJob(db, "u1", "z3", "saved");
    sqlite.run("UPDATE jobs SET closed_at = ?, missed_polls = 2 WHERE id = 'z3'", [new Date().toISOString()]);
    await queueSavedJobClosings(env);
    const sent: NotificationPayload[] = [];
    await deliverDueNotifications(env, new Date(), async (_sub: PushSubscriptionRow, payload: NotificationPayload): Promise<PushResult> => {
      sent.push(payload);
      return { ok: true, status: 200 };
    });
    expect(sent.map((payload) => payload.badge)).toEqual([1]);
    expect(JSON.parse(buildApnsBody(sent[0]!)).aps.badge).toBe(1);
  });
});

describe("the backfill", () => {
  it("fills the stream from existing timelines, emails waiting for a choice, and closed saved jobs", () => {
    const { sqlite } = sqliteD1();
    databases.push(sqlite);
    const before = migrationFiles.filter((file) => file < "0095");
    migrate(sqlite, before);
    seedCatalog(sqlite);
    const at = "2026-10-10T12:00:00.000Z";
    sqlite.run(`INSERT INTO applications (id, user_id, job_id, company_name, title, stage, applied_at, stage_changed_at, created_at, updated_at)
      VALUES ('a1', 'u1', 'z1', 'Zephyr Labs', 'Software Engineer, New Grad', 'interview', ?, ?, ?, ?),
             ('a2', 'u1', 'z2', 'Zephyr Labs', 'Software Engineer', 'saved', NULL, ?, ?, ?)`, [at, at, at, at, at, at, at]);
    sqlite.run(`INSERT INTO application_events (id, application_id, stage, source, occurred_at)
      VALUES ('e1', 'a1', 'applied', 'user', ?), ('e2', 'a1', 'interview', 'email', ?)`, [at, at]);
    sqlite.run(`INSERT INTO inbound_emails (id, user_id, message_hash, received_at, detected_stage, status, created_at)
      VALUES ('m1', 'u1', 'h1', ?, 'rejected', 'needs_choice', ?)`, [at, at]);
    sqlite.run("UPDATE jobs SET closed_at = ?, missed_polls = 3 WHERE id = 'z2'", [at]);

    sqlite.exec(readFileSync(`${migrationsDir}0095_activity.sql`, "utf8"));

    expect(sqlite.query("SELECT kind, source, stage, event_id FROM activity ORDER BY kind, stage").all()).toEqual([
      { kind: "email_needs_choice", source: "email", stage: null, event_id: null },
      { kind: "saved_job_closed", source: "system", stage: null, event_id: null },
      { kind: "stage_moved", source: "user", stage: "applied", event_id: "e1" },
      { kind: "stage_moved", source: "email", stage: "interview", event_id: "e2" },
    ]);
  });
});
