import { notifyAdmins } from "./admin-alerts";
import { hasTable } from "./db-schema";
import { queuedPollingTiers, SOURCE_POLL_INTERVAL_MS, type PollTier } from "./poll-schedule";
import type { NotificationPayload } from "./push";
import type { Env } from "./types";

// The poll cycle once died every 15 minutes for six weeks while every
// dashboard read "ok". This check runs on the every-minute dispatcher cron and
// pages admins when alerts are actually falling behind, instead of relying on
// someone noticing that the feed went quiet.

/** A queued source is overdue once it misses two full cadences. */
const OVERDUE_CADENCES = 2;

/**
 * Jobs wait in notification_match_backlog until matching runs. The cron
 * sweeper alone clears it within ~17 minutes, so anything older than this
 * means both the queue trigger and the sweeper are failing.
 */
export const STALE_BACKLOG_MS = 30 * 60 * 1000;

/** A problem that persists is re-announced at most this often. */
const REALERT_MS = 6 * 60 * 60 * 1000;

const STATE_KEY = "polling_watchdog";

export interface OverdueTier {
  tier: PollTier;
  count: number;
  names: string[];
}

export interface PollingHealth {
  overdue: OverdueTier[];
  staleBacklog: number;
}

interface WatchdogState {
  signature: string;
  alertedAt: string;
}

export async function checkPollingHealth(
  db: D1Database,
  queuedTiers: Set<PollTier>,
  now: Date
): Promise<PollingHealth> {
  const overdue: OverdueTier[] = [];
  for (const tier of queuedTiers) {
    const cutoff = new Date(
      now.getTime() - SOURCE_POLL_INTERVAL_MS[tier] * OVERDUE_CADENCES
    ).toISOString();
    // Quarantined sources are on a deliberate daily backoff and already alert
    // through the quarantine path, so they are not "overdue" here.
    const rows = await db.prepare(
      `SELECT name
       FROM companies
       WHERE enabled = 1
         AND COALESCE(source_type, ats_type) != 'custom'
         AND COALESCE(poll_tier, 1) = ?
         AND quarantined_at IS NULL
         AND last_polled_at IS NOT NULL
         AND last_polled_at < ?
       ORDER BY last_polled_at ASC`
    ).bind(tier, cutoff).all<{ name: string }>();
    const names = (rows.results ?? []).map((row) => row.name);
    if (names.length > 0) {
      overdue.push({ tier, count: names.length, names: names.slice(0, 3) });
    }
  }

  const backlog = await db.prepare(
    "SELECT COUNT(*) AS count FROM notification_match_backlog WHERE queued_at < ?"
  ).bind(new Date(now.getTime() - STALE_BACKLOG_MS).toISOString()).first<{ count: number }>();

  return { overdue, staleBacklog: backlog?.count ?? 0 };
}

export function pollingHealthSignature(health: PollingHealth): string {
  return [
    ...health.overdue.map((entry) => `overdue_tier_${entry.tier}`),
    ...(health.staleBacklog > 0 ? ["stale_backlog"] : []),
  ].join(",");
}

export function buildPollingAlertPayload(health: PollingHealth): NotificationPayload {
  const parts = health.overdue.map((entry) => {
    const listed = entry.count > entry.names.length
      ? `${entry.names.join(", ")} +${entry.count - entry.names.length}`
      : entry.names.join(", ");
    return `Tier ${entry.tier}: ${entry.count} overdue (${listed})`;
  });
  if (health.staleBacklog > 0) {
    parts.push(`${health.staleBacklog} new ${health.staleBacklog === 1 ? "job" : "jobs"} waiting over 30 min to notify`);
  }
  return {
    title: "Job alerts are falling behind",
    body: parts.join(" · "),
    data: { url: "/admin/runs" },
  };
}

/** Decides whether to page, given the last alert that was sent. */
export function shouldAlert(
  signature: string,
  previous: WatchdogState | null,
  now: Date
): boolean {
  if (!signature) return false;
  if (!previous || previous.signature !== signature) return true;
  return now.getTime() - Date.parse(previous.alertedAt) >= REALERT_MS;
}

export async function runPollingWatchdog(
  env: Env,
  now = new Date(),
  alert: typeof notifyAdmins = notifyAdmins
): Promise<PollingHealth | null> {
  const db = env.DB;
  if (!(await hasTable(db, "source_polls"))) return null;

  const health = await checkPollingHealth(db, queuedPollingTiers(env.QUEUE_POLLING_TIERS), now);
  const signature = pollingHealthSignature(health);
  const stored = await db.prepare("SELECT value FROM preferences WHERE key = ?")
    .bind(STATE_KEY)
    .first<{ value: string }>();
  let previous: WatchdogState | null = null;
  try {
    previous = stored ? JSON.parse(stored.value) as WatchdogState : null;
  } catch {
    previous = null;
  }

  if (!signature) {
    if (previous) {
      await db.prepare("DELETE FROM preferences WHERE key = ?").bind(STATE_KEY).run();
    }
    return health;
  }

  if (shouldAlert(signature, previous, now)) {
    await alert(db, env, buildPollingAlertPayload(health));
    await db.prepare(
      `INSERT INTO preferences (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    ).bind(
      STATE_KEY,
      JSON.stringify({ signature, alertedAt: now.toISOString() } satisfies WatchdogState)
    ).run();
  }
  return health;
}
