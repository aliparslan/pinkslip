import type { CompanyRow } from "./types";

// Poll cadence per tier, shared by the cron cycle, the queue dispatcher, the
// watchdog, and the admin latency view.

export type PollTier = 1 | 2;

/** Tier 1 keeps today's 15-minute cadence; the YC-heavy long tail is hourly. */
export const SOURCE_POLL_INTERVAL_MS: Record<PollTier, number> = {
  1: 15 * 60 * 1000,
  2: 60 * 60 * 1000,
};

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
