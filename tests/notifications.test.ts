import { Database } from "bun:sqlite";
import { afterEach, describe, expect, it } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { createGuestSession } from "@worker/auth";
import worker from "@worker/index";
import { ensureJobFeaturesForIds } from "@worker/job-features";
import { savedJobClosedNotification } from "@worker/notification-kinds";
import { deliverPendingNotifications } from "@worker/notification-delivery";
import {
  dailyDigestsDue,
  deliverDueNotifications,
  loadNotificationSettings,
  markNotificationOpened,
  notificationMetricsByKind,
  scheduleNotification,
} from "@worker/notifications";
import { queueSavedJobClosings } from "@worker/notification-scheduler";
import { processNotificationMatchBacklog } from "@worker/poller";
import { buildApnsBody } from "@worker/apns";
import type { NotificationPayload, PushResult } from "@worker/push";
import type { Env, PushSubscriptionRow } from "@worker/types";
import { saveUserPreferenceState } from "@worker/user-preferences";
import { DEFAULT_SEARCH_PROFILE, ONBOARDING_VERSION } from "../shared/search-profile";
import { sqliteD1 } from "./sqlite-d1";

const migrationsDir = new URL("../migrations/", import.meta.url).pathname;
const databases: Database[] = [];
afterEach(() => {
  for (const db of databases.splice(0)) db.close();
});

const NOW = new Date("2026-10-16T16:00:00.000Z"); // 12:00 in New York
const hours = (count: number, from = NOW) => new Date(from.getTime() + count * 60 * 60 * 1000);

function setup() {
  const { sqlite, db } = sqliteD1();
  databases.push(sqlite);
  for (const file of readdirSync(migrationsDir).filter((name) => name.endsWith(".sql")).sort()) {
    sqlite.exec(readFileSync(`${migrationsDir}${file}`, "utf8"));
  }
  sqlite.exec("PRAGMA foreign_keys = ON");
  sqlite.run("INSERT INTO users (id) VALUES ('u1'), ('u2')");
  sqlite.run(`INSERT INTO push_subscriptions (id, endpoint, p256dh, auth, user_id, platform)
    VALUES ('phone-1', 'token-1', '', '', 'u1', 'ios')`);
  const sent: Array<{ endpoint: string; payload: NotificationPayload }> = [];
  let result: PushResult = { ok: true, status: 200 };
  const send = async (subscription: PushSubscriptionRow, payload: NotificationPayload) => {
    sent.push({ endpoint: subscription.endpoint, payload });
    return result;
  };
  const env = { DB: db } as Env;
  return {
    sqlite,
    db,
    env,
    sent,
    send,
    pushResult(next: PushResult) {
      result = next;
    },
    log: () => sqlite.query(
      "SELECT kind, title, body, url, status, devices, error, scheduled_for FROM notification_log ORDER BY created_at, rowid"
    ).all() as Array<Record<string, unknown>>,
  };
}

async function request(env: Env, path: string, token: string, init: RequestInit = {}) {
  return worker.fetch(
    new Request(`https://pinkslip.work${path}`, {
      ...init,
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...init.headers },
    }),
    env,
    { waitUntil() {}, passThroughOnException() {} } as unknown as ExecutionContext
  );
}

describe("notification settings", () => {
  it("lists live kinds with their defaults, new jobs off until turned on", async () => {
    const { db } = setup();
    expect(await loadNotificationSettings(db, "u1")).toEqual({
      time_zone: null,
      kinds: {
        new_jobs: { enabled: false, mode: "post", daily_time: "08:00" },
        saved_job_closed: { enabled: true },
        follow_up: { enabled: true },
        application_moved: { enabled: true },
        which_application: { enabled: true },
        interview_reminder: { enabled: true },
        assessment_due: { enabled: true },
        offer_reply: { enabled: true },
        replied: { enabled: true },
        forwarding_stopped: { enabled: true },
        event_reminder: { enabled: true },
        apply_sent: { enabled: true },
        apply_needs_you: { enabled: true },
        apply_code: { enabled: true },
      },
      passive_per_day: 3,
    });
  });

  it("reads the older job-alert switch until a per-kind row exists", async () => {
    const { sqlite, db } = setup();
    sqlite.run("INSERT INTO user_notification_settings (user_id, enabled, push_enabled) VALUES ('u1', 1, 1)");
    expect((await loadNotificationSettings(db, "u1")).kinds.new_jobs.enabled).toBe(true);
  });

  it("saves the phone's time zone and once a day through PATCH, keeping the older copies in step", async () => {
    const { sqlite, db, env } = setup();
    const session = await createGuestSession(db, "u1");
    const response = await request(env, "/api/v2/notifications", session.id, {
      method: "PATCH",
      body: JSON.stringify({
        time_zone: "America/Chicago",
        kinds: { new_jobs: { enabled: true, mode: "daily", daily_time: "07:30" }, saved_job_closed: { enabled: false } },
      }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      time_zone: "America/Chicago",
      kinds: {
        new_jobs: { enabled: true, mode: "daily", daily_time: "07:30" },
        saved_job_closed: { enabled: false },
      },
    });
    expect(sqlite.query("SELECT enabled FROM user_notification_settings WHERE user_id = 'u1'").get()).toEqual({ enabled: 1 });
    const legacy = await request(env, "/api/v2/push/settings", session.id);
    expect(await legacy.json()).toMatchObject({ enabled: true });
  });

  it("rejects unknown kinds, zones and times", async () => {
    const { db, env } = setup();
    const session = await createGuestSession(db, "u1");
    for (const body of [
      { time_zone: "Mars/Olympus" },
      { kinds: { telepathy: { enabled: true } } },
      { kinds: { new_jobs: { daily_time: "25:00" } } },
      { kinds: { new_jobs: { mode: "hourly" } } },
    ]) {
      const response = await request(env, "/api/v2/notifications", session.id, { method: "PATCH", body: JSON.stringify(body) });
      expect(response.status).toBe(400);
    }
  });

  it("lets the older PUT /push/settings switch write the per-kind row", async () => {
    const { db, env } = setup();
    const session = await createGuestSession(db, "u1");
    await request(env, "/api/v2/push/settings", session.id, { method: "PUT", body: JSON.stringify({ enabled: true }) });
    expect((await loadNotificationSettings(db, "u1")).kinds.new_jobs).toEqual({ enabled: true, mode: "post", daily_time: "08:00" });
  });
});

describe("the scheduler", () => {
  const closed = (jobId: string, company: string, title: string) => ({
    userId: "u1",
    kind: "saved_job_closed" as const,
    dedupeKey: `saved_job_closed:${jobId}`,
    ...savedJobClosedNotification({ jobId, company, title }),
    entityType: "job",
    entityId: jobId,
  });

  it("never schedules the same key twice", async () => {
    const { db } = setup();
    expect(await scheduleNotification(db, closed("j1", "Stripe", "Software Engineer"), NOW)).toBe(true);
    expect(await scheduleNotification(db, closed("j1", "Stripe", "Software Engineer"), NOW)).toBe(false);
  });

  it("sends what's due, with its id for the open receipt, and waits on what isn't", async () => {
    const harness = setup();
    await scheduleNotification(harness.db, closed("j1", "Stripe", "Software Engineer"), NOW);
    await scheduleNotification(harness.db, { ...closed("j2", "Ramp", "Data Analyst"), scheduledFor: hours(1) }, NOW);

    expect(await deliverDueNotifications(harness.env, NOW, harness.send)).toEqual({ sent: 1, held: 0, skipped: 0, failed: 0 });
    expect(harness.sent).toHaveLength(1);
    const { payload } = harness.sent[0]!;
    expect(payload).toMatchObject({ title: "Stripe", body: "Software Engineer has closed", data: { url: "/jobs/j1" }, kind: "saved_job_closed", timeSensitive: false });
    expect(JSON.parse(buildApnsBody(payload))).toMatchObject({
      aps: { "thread-id": "saved_job_closed" },
      notification_id: payload.data.notification_id,
    });

    expect(await markNotificationOpened(harness.db, "u1", { notificationId: payload.data.notification_id }, NOW)).toBe(1);
    expect(await notificationMetricsByKind(harness.db, NOW)).toEqual([{ kind: "saved_job_closed", sent: 1, opened: 1 }]);
  });

  it("groups same-kind notifications that come due together into one push", async () => {
    const harness = setup();
    await scheduleNotification(harness.db, closed("j1", "Stripe", "Software Engineer"), NOW);
    await scheduleNotification(harness.db, closed("j2", "Ramp", "Data Analyst"), NOW);
    await scheduleNotification(harness.db, closed("j3", "Datadog", "SRE"), NOW);

    await deliverDueNotifications(harness.env, NOW, harness.send);

    expect(harness.sent.map(({ payload }) => [payload.title, payload.body, payload.data.url])).toEqual([
      ["3 saved jobs closed", "Stripe, Ramp and Datadog", "/library/saved"],
    ]);
    expect(harness.log().map((row) => row.status)).toEqual(["sent", "sent", "sent"]);
  });

  it("holds passive pushes past three in 24 hours until the oldest leaves the window", async () => {
    const harness = setup();
    for (const [index, sentAt] of [hours(-20), hours(-10), hours(-1)].entries()) {
      harness.sqlite.run(
        `INSERT INTO notification_log (id, user_id, kind, dedupe_key, title, body, url, passive, status, scheduled_for, created_at, sent_at)
         VALUES (?, 'u1', 'follow_up', ?, 't', 'b', '/', 1, 'sent', ?, ?, ?)`,
        [`old-${index}`, `old-${index}`, sentAt.toISOString(), sentAt.toISOString(), sentAt.toISOString()]
      );
    }
    await scheduleNotification(harness.db, closed("j1", "Stripe", "Software Engineer"), NOW);
    await scheduleNotification(harness.db, {
      userId: "u1",
      kind: "follow_up",
      dedupeKey: "urgent",
      title: "Interview with Stripe tomorrow",
      body: "11:00",
      url: "/jobs/j1",
      timeSensitive: true,
    }, NOW);

    expect(await deliverDueNotifications(harness.env, NOW, harness.send)).toEqual({ sent: 1, held: 1, skipped: 0, failed: 0 });
    // The time-sensitive one went; the passive one waits for 4 hours from now.
    expect(harness.sent.map(({ payload }) => [payload.title, payload.timeSensitive])).toEqual([["Interview with Stripe tomorrow", true]]);
    const held = harness.log().find((row) => row.kind === "saved_job_closed")!;
    expect(held).toMatchObject({ status: "scheduled", scheduled_for: hours(4).toISOString(), error: "Waiting for the daily cap" });

    expect((await deliverDueNotifications(harness.env, hours(4), harness.send)).sent).toBe(1);
  });

  it("keeps passive pushes at least 4 hours apart", async () => {
    const harness = setup();
    const lastSent = hours(-1).toISOString();
    harness.sqlite.run(
      `INSERT INTO notification_log (id, user_id, kind, dedupe_key, title, body, url, passive, status, scheduled_for, created_at, sent_at)
       VALUES ('earlier', 'u1', 'follow_up', 'earlier', 't', 'b', '/', 1, 'sent', ?, ?, ?)`,
      [lastSent, lastSent, lastSent]
    );
    await scheduleNotification(harness.db, closed("j1", "Stripe", "Software Engineer"), NOW);

    expect((await deliverDueNotifications(harness.env, NOW, harness.send)).held).toBe(1);
    expect(harness.log().find((row) => row.kind === "saved_job_closed")).toMatchObject({ scheduled_for: hours(3).toISOString() });
    expect((await deliverDueNotifications(harness.env, hours(3), harness.send)).sent).toBe(1);
  });

  it("sends a follow-up when it comes due, without the spacing, but within the three", async () => {
    const harness = setup();
    const insert = (id: string, sentAt: Date) => harness.sqlite.run(
      `INSERT INTO notification_log (id, user_id, kind, dedupe_key, title, body, url, passive, status, scheduled_for, created_at, sent_at)
       VALUES (?, 'u1', 'saved_job_closed', ?, 't', 'b', '/', 1, 'sent', ?, ?, ?)`,
      [id, id, sentAt.toISOString(), sentAt.toISOString(), sentAt.toISOString()]
    );
    const followUp = (key: string, at: Date) => scheduleNotification(harness.db, {
      userId: "u1", kind: "follow_up", dedupeKey: key, title: "Follow up with Stripe", body: "Ready", url: "/jobs/j1",
    }, at);
    insert("an-hour-ago", hours(-1));
    await followUp("f1", NOW);
    expect((await deliverDueNotifications(harness.env, NOW, harness.send)).sent).toBe(1);

    // Now three in 24 hours (the one above, the closing and one more): it waits.
    insert("earlier", hours(-20));
    await followUp("f2", hours(0.5));
    expect((await deliverDueNotifications(harness.env, hours(0.5), harness.send)).held).toBe(1);
    expect(harness.log().find((row) => row.kind === "follow_up" && row.status === "scheduled"))
      .toMatchObject({ scheduled_for: hours(4).toISOString() });
  });

  it("doesn't count new-job alerts toward the cap", async () => {
    const harness = setup();
    for (const [index, sentAt] of [hours(-3), hours(-2), hours(-1)].entries()) {
      harness.sqlite.run(
        `INSERT INTO notification_log (id, user_id, kind, dedupe_key, title, body, url, passive, status, scheduled_for, created_at, sent_at)
         VALUES (?, 'u1', 'new_jobs', ?, 't', 'b', '/', 1, 'sent', ?, ?, ?)`,
        [`jobs-${index}`, `jobs-${index}`, sentAt.toISOString(), sentAt.toISOString(), sentAt.toISOString()]
      );
    }
    await scheduleNotification(harness.db, closed("j1", "Stripe", "Software Engineer"), NOW);
    expect((await deliverDueNotifications(harness.env, NOW, harness.send)).sent).toBe(1);
  });

  it("skips kinds the person turned off and people without a device", async () => {
    const harness = setup();
    harness.sqlite.run(`INSERT INTO notification_settings (user_id, kind, enabled, updated_at) VALUES ('u1', 'saved_job_closed', 0, ?)`, [NOW.toISOString()]);
    await scheduleNotification(harness.db, closed("j1", "Stripe", "Software Engineer"), NOW);
    await scheduleNotification(harness.db, { ...closed("j2", "Ramp", "Data Analyst"), userId: "u2" }, NOW);

    expect(await deliverDueNotifications(harness.env, NOW, harness.send)).toEqual({ sent: 0, held: 0, skipped: 2, failed: 0 });
    expect(harness.log().map((row) => row.error)).toEqual(["Turned off", "No registered device"]);
  });

  it("retries a failed send twice, then gives up, and drops dead tokens", async () => {
    const harness = setup();
    harness.pushResult({ ok: false, status: 500, body: "{\"reason\":\"InternalServerError\"}" });
    await scheduleNotification(harness.db, closed("j1", "Stripe", "Software Engineer"), NOW);

    await deliverDueNotifications(harness.env, NOW, harness.send);
    await deliverDueNotifications(harness.env, hours(0.1), harness.send);
    await deliverDueNotifications(harness.env, hours(0.2), harness.send);
    expect(harness.sent).toHaveLength(3);
    expect(harness.log()[0]).toMatchObject({ status: "failed" });

    harness.pushResult({ ok: false, status: 410 });
    await scheduleNotification(harness.db, closed("j2", "Ramp", "Data Analyst"), hours(1));
    await deliverDueNotifications(harness.env, hours(1), harness.send);
    expect(harness.sqlite.query("SELECT COUNT(*) AS count FROM push_subscriptions").get()).toEqual({ count: 0 });
  });
});

describe("a run that died mid-send", () => {
  it("puts scheduled kinds back and closes a daily new-jobs claim", async () => {
    const harness = setup();
    const stale = hours(-1).toISOString();
    harness.sqlite.run(
      `INSERT INTO notification_log (id, user_id, kind, dedupe_key, title, body, url, passive, status, scheduled_for, attempt_count, created_at)
       VALUES ('digest', 'u1', 'new_jobs', 'new_jobs_daily:2026-10-16', '', '', '/', 1, 'sending', ?, 0, ?),
              ('closing', 'u1', 'saved_job_closed', 'saved_job_closed:j1', 'Stripe', 'SWE has closed', '/jobs/j1', 1, 'sending', ?, 1, ?)`,
      [stale, stale, stale, stale]
    );
    await deliverDueNotifications(harness.env, NOW, harness.send);
    expect(harness.sent.map(({ payload }) => payload.title)).toEqual(["Stripe"]);
    expect(harness.sqlite.query("SELECT id, status FROM notification_log ORDER BY id").all()).toEqual([
      { id: "closing", status: "sent" },
      { id: "digest", status: "failed" },
    ]);
  });
});

describe("saved jobs closing (N9)", () => {
  function seed(sqlite: Database) {
    sqlite.run("INSERT INTO companies (id, name, ats_type, ats_slug) VALUES ('t-stripe', 'Stripe', 'greenhouse', 'stripe-test')");
    const closedAt = hours(-2).toISOString();
    for (const [id, missed, closed] of [
      ["gone", 2, closedAt],
      ["descoped", 0, closedAt],
      ["old", 5, hours(-30).toISOString()],
      ["open", 0, null],
    ] as const) {
      sqlite.run(
        `INSERT INTO jobs (id, company_id, external_id, title, url, location, closed_at, missed_polls)
         VALUES (?, 't-stripe', ?, ?, 'https://example.com', 'New York, NY', ?, ?)`,
        [id, id, `Role ${id}`, closed, missed]
      );
      sqlite.run(
        `INSERT INTO applications (id, user_id, job_id, company_name, title, stage, stage_changed_at, created_at, updated_at)
         VALUES (?, 'u1', ?, 'Stripe', ?, 'saved', ?, ?, ?)`,
        [`a-${id}`, id, `Role ${id}`, NOW.toISOString(), NOW.toISOString(), NOW.toISOString()]
      );
    }
    sqlite.run(
      `INSERT INTO applications (id, user_id, job_id, company_name, title, stage, stage_changed_at, created_at, updated_at)
       VALUES ('a-applied', 'u2', 'gone', 'Stripe', 'Role gone', 'applied', ?, ?, ?)`,
      [NOW.toISOString(), NOW.toISOString(), NOW.toISOString()]
    );
  }

  it("queues one push per saved job the company closed in the last day", async () => {
    const harness = setup();
    seed(harness.sqlite);
    expect(await queueSavedJobClosings(harness.env, NOW)).toBe(1);
    expect(await queueSavedJobClosings(harness.env, hours(0.25))).toBe(0);
    expect(harness.log()).toEqual([expect.objectContaining({
      kind: "saved_job_closed",
      title: "Stripe",
      body: "Role gone has closed",
      url: "/jobs/gone",
      status: "scheduled",
    })]);
  });
});

describe("new-job alerts (N1, N2)", () => {
  async function matchedJobs(harness: ReturnType<typeof setup>, count: number, options: { daily?: boolean; zone?: string } = {}) {
    const { sqlite, db } = harness;
    sqlite.run("INSERT INTO companies (id, name, ats_type, ats_slug) VALUES ('t-c1', 'Datadog', 'greenhouse', 'datadog-test'), ('t-c2', 'Ramp', 'greenhouse', 'ramp-test'), ('t-c3', 'Mercury', 'greenhouse', 'mercury-test'), ('t-c4', 'Stripe', 'greenhouse', 'stripe-test')");
    const ids: string[] = [];
    for (let index = 0; index < count; index += 1) {
      const id = `job-${index}`;
      ids.push(id);
      sqlite.run(
        `INSERT INTO jobs (id, company_id, external_id, title, url, location, description, posted_at, first_seen_at)
         VALUES (?, ?, ?, 'Software Engineer', 'https://example.com', 'Remote - US', 'Build useful software.', ?, ?)`,
        [id, `t-c${(index % 4) + 1}`, id, new Date().toISOString(), NOW.toISOString()]
      );
    }
    await ensureJobFeaturesForIds(db, ids);
    await saveUserPreferenceState(db, "u1", {
      search_profile: {
        ...DEFAULT_SEARCH_PROFILE,
        onboarding_version: ONBOARDING_VERSION,
        onboarding_completed_at: NOW.toISOString(),
        target_levels: ["early_career"],
        location_ids: [],
        notifications_enabled: true,
      },
    });
    if (options.daily) {
      sqlite.run("UPDATE notification_settings SET mode = 'daily', daily_time = '08:00' WHERE user_id = 'u1' AND kind = 'new_jobs'");
    }
    if (options.zone) sqlite.run("UPDATE users SET time_zone = ? WHERE id = 'u1'", [options.zone]);
    for (const id of ids) sqlite.run("INSERT INTO notification_match_backlog (job_id, queued_at) VALUES (?, ?)", [id, NOW.toISOString()]);
    await processNotificationMatchBacklog(db);
    return ids;
  }

  it("sends new jobs as one push per person and logs it", async () => {
    const harness = setup();
    await matchedJobs(harness, 5);
    const sent = await deliverPendingNotifications(harness.db, harness.env, 200, { now: NOW, send: harness.send });

    expect(sent).toBe(5);
    expect(harness.sent).toHaveLength(1);
    expect(harness.sent[0]!.payload).toMatchObject({ title: "5 new jobs", kind: "new_jobs" });
    expect(harness.log()).toEqual([expect.objectContaining({ kind: "new_jobs", title: "5 new jobs", status: "sent", devices: 1 })]);
    const notificationId = harness.sent[0]!.payload.data.notification_id;
    expect(harness.sqlite.query("SELECT id FROM notification_log").get()).toEqual({ id: notificationId });
  });

  it("sends one push per person per run, leaving jobs past 100 for the next", async () => {
    const harness = setup();
    await matchedJobs(harness, 103);
    expect(await deliverPendingNotifications(harness.db, harness.env, 200, { now: NOW, send: harness.send })).toBe(100);
    expect(harness.sent.map(({ payload }) => payload.title)).toEqual(["100 new jobs"]);
    expect(harness.sqlite.query("SELECT COUNT(*) AS count FROM notification_candidates WHERE status = 'pending'").get()).toEqual({ count: 3 });
    expect(await deliverPendingNotifications(harness.db, harness.env, 200, { now: hours(0.1), send: harness.send })).toBe(3);
    expect(harness.sent.map(({ payload }) => payload.title)).toEqual(["100 new jobs", "3 new jobs"]);
  });

  it("sends new jobs as they post whatever the daily cap", async () => {
    const harness = setup();
    for (const [index, sentAt] of [hours(-3), hours(-2), hours(-1)].entries()) {
      harness.sqlite.run(
        `INSERT INTO notification_log (id, user_id, kind, dedupe_key, title, body, url, passive, status, scheduled_for, created_at, sent_at)
         VALUES (?, 'u1', 'follow_up', ?, 't', 'b', '/', 1, 'sent', ?, ?, ?)`,
        [`old-${index}`, `old-${index}`, sentAt.toISOString(), sentAt.toISOString(), sentAt.toISOString()]
      );
    }
    await matchedJobs(harness, 2);
    expect(await deliverPendingNotifications(harness.db, harness.env, 200, { now: NOW, send: harness.send })).toBe(2);
    expect(harness.sent).toHaveLength(1);
  });

  it("keeps once-a-day people's jobs for their time, then sends one digest", async () => {
    const harness = setup();
    await matchedJobs(harness, 6, { daily: true, zone: "America/New_York" });
    // As-they-post delivery passes them by.
    expect(await deliverPendingNotifications(harness.db, harness.env, 200, { now: NOW, send: harness.send })).toBe(0);

    const early = new Date("2026-10-16T11:30:00.000Z"); // 7:30 in New York
    expect(await dailyDigestsDue(harness.db, early)).toEqual([]);
    const digests = await dailyDigestsDue(harness.db, NOW);
    expect(digests).toEqual([{ userId: "u1", dedupeKey: "new_jobs_daily:2026-10-16" }]);

    expect(await deliverPendingNotifications(harness.db, harness.env, 200, { now: NOW, send: harness.send, digests })).toBe(6);
    expect(harness.sent).toHaveLength(1);
    const { payload } = harness.sent[0]!;
    expect([payload.title, payload.data.url]).toEqual(["6 new jobs today", "/"]);
    // Three companies named, the jobs at the fourth counted.
    expect(payload.body).toMatch(/^\w+, \w+, \w+ and 1 more$/);
    expect(await dailyDigestsDue(harness.db, hours(1))).toEqual([]);
  });
});
