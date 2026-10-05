import { describe, expect, it } from "bun:test";
import {
  loadPollingLatency,
  parseDbTimestamp,
  percentile,
} from "@worker/polling-latency";
import type { Env } from "@worker/types";
import { sqliteD1 } from "./sqlite-d1";

const NOW = new Date("2026-10-04T12:00:00.000Z");
const minutesAgo = (minutes: number) =>
  new Date(NOW.getTime() - minutes * 60 * 1000).toISOString();

describe("percentile", () => {
  it("uses nearest rank", () => {
    expect(percentile([], 0.5)).toBeNull();
    expect(percentile([5, 1, 3], 0.5)).toBe(3);
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.95)).toBe(10);
  });
});

describe("parseDbTimestamp", () => {
  it("reads SQLite datetime() output as UTC", () => {
    expect(parseDbTimestamp("2026-10-04 12:00:00")).toBe(NOW.getTime());
    expect(parseDbTimestamp("2026-10-04T12:00:00.000Z")).toBe(NOW.getTime());
  });
});

describe("loadPollingLatency", () => {
  it("reports cadence, alert delay, and freshness per tier", async () => {
    const { sqlite, db } = sqliteD1();
    sqlite.exec(`
      CREATE TABLE companies (
        id TEXT PRIMARY KEY, ats_type TEXT NOT NULL DEFAULT 'greenhouse', source_type TEXT,
        enabled INTEGER NOT NULL DEFAULT 1, poll_tier INTEGER NOT NULL DEFAULT 1,
        last_polled_at TEXT, quarantined_at TEXT
      );
      CREATE TABLE jobs (id TEXT PRIMARY KEY, company_id TEXT NOT NULL, first_seen_at TEXT NOT NULL);
      CREATE TABLE notification_candidates (
        id TEXT PRIMARY KEY, job_id TEXT NOT NULL, status TEXT NOT NULL, sent_at TEXT
      );
      CREATE TABLE source_polls (
        id TEXT PRIMARY KEY, poll_tier INTEGER NOT NULL, previous_polled_at TEXT, started_at TEXT NOT NULL
      );
    `);
    sqlite.run(`INSERT INTO companies (id, poll_tier, last_polled_at) VALUES
      ('big', 1, '${minutesAgo(5)}'),
      ('stale', 1, '${minutesAgo(45)}'),
      ('yc', 2, '${minutesAgo(30)}')`);
    sqlite.run(`INSERT INTO source_polls VALUES
      ('p1', 1, '${minutesAgo(30)}', '${minutesAgo(15)}'),
      ('p2', 1, '${minutesAgo(20)}', '${minutesAgo(5)}'),
      ('p3', 2, '${minutesAgo(260)}', '${minutesAgo(60)}')`);
    sqlite.run(`INSERT INTO jobs VALUES
      ('j1', 'big', '${minutesAgo(10)}'),
      ('j2', 'big', '2026-10-04 11:40:00'),
      ('j3', 'big', '${minutesAgo(3 * 24 * 60)}')`);
    sqlite.run(`INSERT INTO notification_candidates VALUES
      ('n1', 'j1', 'sent', '${minutesAgo(9)}'),
      ('n2', 'j2', 'sent', '${minutesAgo(18)}'),
      ('n3', 'j3', 'sent', '${minutesAgo(1)}'),
      ('n4', 'j1', 'pending', NULL)`);

    const report = await loadPollingLatency(
      { DB: db, QUEUE_POLLING_TIERS: "2" } as Env,
      NOW
    );

    expect(report.tiers).toEqual([
      {
        tier: 1,
        mode: "cron",
        target_interval_minutes: 15,
        sources: 2,
        overdue_sources: 1,
        poll_gap: { p50_minutes: 15, p95_minutes: 15, samples: 2 },
        // The three-day-old job was a repair, not a new-posting alert.
        alert_delay: { p50_minutes: 1, p95_minutes: 2, samples: 2 },
        estimated_p95_minutes: 17,
      },
      {
        tier: 2,
        mode: "queue",
        target_interval_minutes: 60,
        sources: 1,
        overdue_sources: 0,
        poll_gap: { p50_minutes: 200, p95_minutes: 200, samples: 1 },
        alert_delay: { p50_minutes: null, p95_minutes: null, samples: 0 },
        estimated_p95_minutes: null,
      },
    ]);
  });
});
