import { describe, expect, it } from "bun:test";
import {
  buildPollingAlertPayload,
  runPollingWatchdog,
  shouldAlert,
  STALE_BACKLOG_MS,
} from "@worker/polling-watchdog";
import type { NotificationPayload } from "@worker/push";
import type { Env } from "@worker/types";
import { sqliteD1 } from "./sqlite-d1";

const NOW = new Date("2026-10-04T12:00:00.000Z");
const minutesAgo = (minutes: number, from = NOW) =>
  new Date(from.getTime() - minutes * 60 * 1000).toISOString();

function watchdogDb() {
  const harness = sqliteD1();
  harness.sqlite.exec(`
    CREATE TABLE companies (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      ats_type TEXT NOT NULL DEFAULT 'greenhouse',
      source_type TEXT,
      enabled INTEGER NOT NULL DEFAULT 1,
      poll_tier INTEGER NOT NULL DEFAULT 1,
      last_polled_at TEXT,
      quarantined_at TEXT
    );
    CREATE TABLE notification_match_backlog (job_id TEXT PRIMARY KEY, queued_at TEXT NOT NULL);
    CREATE TABLE preferences (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE source_polls (id TEXT PRIMARY KEY);
  `);
  return harness;
}

function recorder() {
  const alerts: NotificationPayload[] = [];
  return {
    alerts,
    alert: async (_db: D1Database, _env: Env, payload: NotificationPayload) => {
      alerts.push(payload);
      return 1;
    },
  };
}

describe("runPollingWatchdog", () => {
  it("stays quiet while queued sources are on cadence", async () => {
    const { sqlite, db } = watchdogDb();
    sqlite.run(`INSERT INTO companies (id, name, poll_tier, last_polled_at)
                VALUES ('a', 'Stripe', 1, '${minutesAgo(16)}'), ('b', 'YC Co', 2, '${minutesAgo(70)}')`);
    const { alerts, alert } = recorder();

    const health = await runPollingWatchdog(
      { DB: db, QUEUE_POLLING_TIERS: "1,2" } as Env,
      NOW,
      alert
    );

    expect(health).toEqual({ overdue: [], staleBacklog: 0 });
    expect(alerts).toEqual([]);
  });

  it("pages once when a queued tier misses two cadences, then waits before repeating", async () => {
    const { sqlite, db } = watchdogDb();
    sqlite.run(`INSERT INTO companies (id, name, poll_tier, last_polled_at, quarantined_at) VALUES
      ('a', 'Stripe', 1, '${minutesAgo(31)}', NULL),
      ('b', 'Ramp', 1, '${minutesAgo(45)}', NULL),
      ('c', 'Broken', 1, '${minutesAgo(600)}', '${minutesAgo(900)}'),
      ('d', 'Cron Co', 2, '${minutesAgo(600)}', NULL)`);
    const env = { DB: db, QUEUE_POLLING_TIERS: "1" } as Env;
    const { alerts, alert } = recorder();

    await runPollingWatchdog(env, NOW, alert);
    await runPollingWatchdog(env, new Date(NOW.getTime() + 60_000), alert);

    expect(alerts).toEqual([{
      title: "Job alerts are falling behind",
      body: "Tier 1: 2 overdue (Ramp, Stripe)",
      data: { url: "/admin/runs" },
    }]);
  });

  it("flags new jobs that have waited too long to notify", async () => {
    const { sqlite, db } = watchdogDb();
    sqlite.run(`INSERT INTO notification_match_backlog VALUES
      ('old', '${new Date(NOW.getTime() - STALE_BACKLOG_MS - 1000).toISOString()}'),
      ('new', '${minutesAgo(2)}')`);
    const { alerts, alert } = recorder();

    const health = await runPollingWatchdog({ DB: db, QUEUE_POLLING_TIERS: "" } as Env, NOW, alert);

    expect(health?.staleBacklog).toBe(1);
    expect(alerts[0].body).toBe("1 new job waiting over 30 min to notify");
  });

  it("clears its state on recovery so the next incident pages immediately", async () => {
    const { sqlite, db } = watchdogDb();
    sqlite.run(`INSERT INTO companies (id, name, poll_tier, last_polled_at)
                VALUES ('a', 'Stripe', 1, '${minutesAgo(40)}')`);
    const env = { DB: db, QUEUE_POLLING_TIERS: "1" } as Env;
    const { alerts, alert } = recorder();

    await runPollingWatchdog(env, NOW, alert);
    sqlite.run(`UPDATE companies SET last_polled_at = '${minutesAgo(1)}'`);
    await runPollingWatchdog(env, NOW, alert);
    expect(sqlite.query("SELECT COUNT(*) AS count FROM preferences").get()).toEqual({ count: 0 });

    sqlite.run(`UPDATE companies SET last_polled_at = '${minutesAgo(40)}'`);
    await runPollingWatchdog(env, NOW, alert);
    expect(alerts).toHaveLength(2);
  });
});

describe("shouldAlert", () => {
  it("re-announces a persisting problem every six hours, and a new kind at once", () => {
    const previous = { signature: "overdue_tier_1", alertedAt: NOW.toISOString() };
    expect(shouldAlert("", null, NOW)).toBe(false);
    expect(shouldAlert("overdue_tier_1", null, NOW)).toBe(true);
    expect(shouldAlert("overdue_tier_1", previous, new Date(NOW.getTime() + 60 * 60 * 1000))).toBe(false);
    expect(shouldAlert("overdue_tier_1", previous, new Date(NOW.getTime() + 6 * 60 * 60 * 1000))).toBe(true);
    expect(shouldAlert("overdue_tier_1,stale_backlog", previous, NOW)).toBe(true);
  });
});

describe("buildPollingAlertPayload", () => {
  it("summarizes overdue tiers and stuck notifications together", () => {
    expect(buildPollingAlertPayload({
      overdue: [{ tier: 2, count: 5, names: ["A", "B", "C"] }],
      staleBacklog: 4,
    }).body).toBe("Tier 2: 5 overdue (A, B, C +2) · 4 new jobs waiting over 30 min to notify");
  });
});
