import { hasTable } from "./db-schema";
import { queuedPollingTiers, SOURCE_POLL_INTERVAL_MS, type PollTier } from "./poll-schedule";
import type { Env } from "./types";

// Measures the two halves of posting-to-alert time per poll tier:
//   poll gap     — how long a source goes between polls (worst-case detection)
//   alert delay  — discovery (jobs.first_seen_at) to the push being sent
// Their p95s added together are a conservative time-to-alert estimate, and the
// numbers come from the same tables whether a tier runs on cron or the queue,
// so a tier's cutover can be compared against its own baseline.

const POLL_GAP_WINDOW_MS = 24 * 60 * 60 * 1000;
const ALERT_DELAY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Pushes sent more than a day after discovery come from content repairs and
 * reclassification, not from a new posting; including them would describe
 * maintenance work rather than alert speed.
 */
const NEW_JOB_ALERT_MAX_DELAY_MS = 24 * 60 * 60 * 1000;

export interface LatencySummary {
  p50_minutes: number | null;
  p95_minutes: number | null;
  samples: number;
}

export interface TierLatency {
  tier: PollTier;
  mode: "cron" | "queue";
  target_interval_minutes: number;
  sources: number;
  overdue_sources: number;
  poll_gap: LatencySummary;
  alert_delay: LatencySummary;
  /** p95 poll gap + p95 alert delay; null until both have samples. */
  estimated_p95_minutes: number | null;
}

export interface PollingLatencyReport {
  generated_at: string;
  tiers: TierLatency[];
}

/** D1 rows mix ISO strings with SQLite's "YYYY-MM-DD HH:MM:SS" (UTC) form. */
export function parseDbTimestamp(value: string): number {
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)
    ? `${value.replace(" ", "T")}Z`
    : value;
  return Date.parse(normalized);
}

/** Nearest-rank percentile over already-collected samples. */
export function percentile(values: number[], fraction: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.max(1, Math.ceil(fraction * sorted.length));
  return sorted[rank - 1];
}

export function summarize(millis: number[]): LatencySummary {
  const toMinutes = (value: number | null) =>
    value === null ? null : Math.round(value / 6_000) / 10;
  return {
    p50_minutes: toMinutes(percentile(millis, 0.5)),
    p95_minutes: toMinutes(percentile(millis, 0.95)),
    samples: millis.length,
  };
}

export async function loadPollingLatency(
  env: Env,
  now = new Date()
): Promise<PollingLatencyReport> {
  const db = env.DB;
  const queued = queuedPollingTiers(env.QUEUE_POLLING_TIERS);
  const tiers: PollTier[] = [1, 2];
  const gaps = new Map<PollTier, number[]>(tiers.map((tier) => [tier, []]));
  const delays = new Map<PollTier, number[]>(tiers.map((tier) => [tier, []]));

  if (await hasTable(db, "source_polls")) {
    const polls = await db.prepare(
      `SELECT poll_tier, previous_polled_at, started_at
       FROM source_polls
       WHERE started_at >= ? AND previous_polled_at IS NOT NULL`
    ).bind(new Date(now.getTime() - POLL_GAP_WINDOW_MS).toISOString())
      .all<{ poll_tier: number; previous_polled_at: string; started_at: string }>();
    for (const poll of polls.results ?? []) {
      const gap = parseDbTimestamp(poll.started_at) - parseDbTimestamp(poll.previous_polled_at);
      if (Number.isFinite(gap) && gap >= 0) gaps.get(poll.poll_tier as PollTier)?.push(gap);
    }
  }

  const sent = await db.prepare(
    `SELECT COALESCE(c.poll_tier, 1) AS poll_tier, j.first_seen_at, nc.sent_at
     FROM notification_candidates nc
     JOIN jobs j ON j.id = nc.job_id
     JOIN companies c ON c.id = j.company_id
     WHERE nc.status = 'sent' AND nc.sent_at >= ?`
  ).bind(new Date(now.getTime() - ALERT_DELAY_WINDOW_MS).toISOString())
    .all<{ poll_tier: number; first_seen_at: string; sent_at: string }>();
  for (const row of sent.results ?? []) {
    const delay = parseDbTimestamp(row.sent_at) - parseDbTimestamp(row.first_seen_at);
    if (Number.isFinite(delay) && delay >= 0 && delay <= NEW_JOB_ALERT_MAX_DELAY_MS) {
      delays.get(row.poll_tier as PollTier)?.push(delay);
    }
  }

  const report: TierLatency[] = [];
  for (const tier of tiers) {
    const interval = SOURCE_POLL_INTERVAL_MS[tier];
    const freshness = await db.prepare(
      `SELECT COUNT(*) AS sources,
              SUM(CASE WHEN last_polled_at IS NOT NULL AND last_polled_at < ? THEN 1 ELSE 0 END) AS overdue
       FROM companies
       WHERE enabled = 1
         AND COALESCE(source_type, ats_type) != 'custom'
         AND COALESCE(poll_tier, 1) = ?
         AND quarantined_at IS NULL`
    ).bind(new Date(now.getTime() - interval * 2).toISOString(), tier)
      .first<{ sources: number; overdue: number | null }>();
    const pollGap = summarize(gaps.get(tier) ?? []);
    const alertDelay = summarize(delays.get(tier) ?? []);
    report.push({
      tier,
      mode: queued.has(tier) ? "queue" : "cron",
      target_interval_minutes: interval / 60_000,
      sources: freshness?.sources ?? 0,
      overdue_sources: freshness?.overdue ?? 0,
      poll_gap: pollGap,
      alert_delay: alertDelay,
      estimated_p95_minutes: pollGap.p95_minutes !== null && alertDelay.p95_minutes !== null
        ? Math.round((pollGap.p95_minutes + alertDelay.p95_minutes) * 10) / 10
        : null,
    });
  }

  return { generated_at: now.toISOString(), tiers: report };
}
