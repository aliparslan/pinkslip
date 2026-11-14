import type { CompanyRow } from "./types";

// Poll cadence per tier, shared by the cron cycle, the queue dispatcher, the
// watchdog, and the admin latency view.

export type PollTier = 1 | 2;

/** Tier 1 keeps today's 15-minute cadence; the YC-heavy long tail is hourly. */
export const SOURCE_POLL_INTERVAL_MS: Record<PollTier, number> = {
  1: 15 * 60 * 1000,
  2: 60 * 60 * 1000,
};

/**
 * YC company pages are polled every 6 hours rather than with tier 2. Hourly
 * was about 600 requests an hour to ycombinator.com, and on 2026-11-14 YC
 * began answering nearly all of them with 429. YC startups post rarely, so
 * little is lost (docs/poll-failures-2026-11-14.md).
 */
export const YC_SOURCE_TYPE = "yc";
export const YC_POLL_INTERVAL_MS = 6 * 60 * 60 * 1000;

/** The error `YcAdapter` throws when YC rate limits a page. */
export const YC_RATE_LIMITED_ERROR = "YC jobs page 429";

/**
 * After a 429 from YC, no YC page is fetched until this long after the latest
 * one, so we stop adding to the limit and it can lift. While the block holds,
 * each pause ends with one tick's worth of attempts and, if refused, another
 * pause.
 */
export const YC_RATE_LIMIT_PAUSE_MS = 60 * 60 * 1000;

/** How often a source is due: its tier's cadence, or YC's own. */
export function sourcePollIntervalMs(tier: PollTier, sourceType: string): number {
  return sourceType === YC_SOURCE_TYPE ? YC_POLL_INTERVAL_MS : SOURCE_POLL_INTERVAL_MS[tier];
}

/**
 * Until when YC polls are paused, or null when they aren't. Read from the
 * poll history, so it needs no state of its own.
 */
export async function ycPausedUntil(db: D1Database, now: Date): Promise<Date | null> {
  const row = await db.prepare(
    `SELECT MAX(started_at) AS limited_at
     FROM source_polls
     WHERE started_at >= ? AND error = ?`
  ).bind(
    new Date(now.getTime() - YC_RATE_LIMIT_PAUSE_MS).toISOString(),
    YC_RATE_LIMITED_ERROR
  ).first<{ limited_at: string | null }>();
  if (!row?.limited_at) return null;
  const until = new Date(Date.parse(row.limited_at) + YC_RATE_LIMIT_PAUSE_MS);
  return until > now ? until : null;
}

export function queuedPollingTiers(value: string | undefined): Set<PollTier> {
  const tiers = new Set<PollTier>();
  for (const part of (value ?? "").split(",")) {
    const tier = Number(part.trim());
    if (tier === 1 || tier === 2) tiers.add(tier);
  }
  return tiers;
}

export function sourcePollRecord(
  db: D1Database,
  args: {
    company: Pick<CompanyRow, "id" | "last_polled_at">;
    tier: number;
    mode: "cron" | "queue";
    startedAt: string;
    finishedAt: string;
    newJobs: number;
    error: string | null;
  }
): D1PreparedStatement {
  return db.prepare(
    `INSERT INTO source_polls (
       id, company_id, poll_tier, mode, status, previous_polled_at,
       started_at, finished_at, new_jobs, error
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    crypto.randomUUID(),
    args.company.id,
    args.tier,
    args.mode,
    args.error === null ? "ok" : "error",
    args.company.last_polled_at,
    args.startedAt,
    args.finishedAt,
    args.newJobs,
    args.error?.slice(0, 1000) ?? null
  );
}
