import { notifyAdminsOfQuarantinedSources } from "./admin-alerts";
import { sourceDecisionRecorder } from "./classification-shadow";
import { loadCustomTitles } from "./job-scope";
import { companyPollOutcome, pollCompany, QUARANTINE_RETRY_MS } from "./poller";
import {
  queuedPollingTiers,
  SOURCE_POLL_INTERVAL_MS,
  sourcePollRecord,
  type PollTier,
} from "./poll-schedule";
import type { CompanyRow, Env } from "./types";

// ─── Queue-based source polling ──────────────────────────────────────────────
//
// A once-a-minute cron claims sources whose tier cadence has elapsed and sends
// each to a queue. Every source then polls in its own consumer invocation with
// a fresh CPU, memory, and subrequest budget, instead of all of them sharing
// one cron invocation. Tiers move onto the queue individually through
// QUEUE_POLLING_TIERS, and the cron cycle skips exactly those tiers, so the two
// paths never poll the same source.

export const SOURCE_DISPATCH_CRON_SCHEDULE = "* * * * *";

/**
 * The dispatcher only runs once a minute, so a source due at 12:15:30 would
 * otherwise wait until 12:16 and its cadence would drift a minute late every
 * cycle. Treating it as due one tick early keeps polls at or under the cadence.
 */
const DISPATCH_TICK_MS = 60 * 1000;

/**
 * Per-tick ceilings spread a cold start (every source due at once) across a
 * few minutes instead of firing hundreds of polls at shared ATS hosts in the
 * same second. Steady state needs ~4 tier-1 and ~14 tier-2 polls per minute.
 */
export const SOURCE_DISPATCH_LIMIT_PER_TICK: Record<PollTier, number> = {
  1: 10,
  2: 30,
};

/**
 * A consumer invocation can run for at most 15 minutes of wall time. A claim
 * older than that belongs to a poll that died without reporting back, so the
 * source becomes claimable again rather than going dark.
 */
export const SOURCE_POLL_CLAIM_TTL_MS = 20 * 60 * 1000;

export const SOURCE_POLL_PRIORITY_QUEUE_NAME = "pinkslip-source-poll-priority";
export const SOURCE_POLL_QUEUE_NAME = "pinkslip-source-poll";

export interface SourcePollMessage {
  companyId: string;
  tier: PollTier;
  /** Must equal companies.poll_claimed_at for the consumer to poll. */
  claimedAt: string;
}

/**
 * Atomically claims up to `limit` due sources in one tier. The claim and the
 * due check happen in a single UPDATE so two overlapping dispatcher ticks can
 * never both enqueue the same source.
 */
export async function claimDueSources(
  db: D1Database,
  tier: PollTier,
  now: Date,
  limit = SOURCE_DISPATCH_LIMIT_PER_TICK[tier]
): Promise<Array<{ id: string; poll_claimed_at: string }>> {
  const claimedAt = now.toISOString();
  const dueBefore = new Date(
    now.getTime() - SOURCE_POLL_INTERVAL_MS[tier] + DISPATCH_TICK_MS
  ).toISOString();
  // Quarantined sources keep the existing one-retry-a-day backoff.
  const quarantineRetryBefore = new Date(now.getTime() - QUARANTINE_RETRY_MS).toISOString();
  const claimExpiredBefore = new Date(now.getTime() - SOURCE_POLL_CLAIM_TTL_MS).toISOString();

  const result = await db.prepare(
    `UPDATE companies
     SET poll_claimed_at = ?
     WHERE id IN (
       SELECT id
       FROM companies
       WHERE enabled = 1
         AND COALESCE(source_type, ats_type) != 'custom'
         AND COALESCE(poll_tier, 1) = ?
         AND (poll_claimed_at IS NULL OR poll_claimed_at < ?)
         AND (
           last_polled_at IS NULL
           OR (quarantined_at IS NULL AND last_polled_at < ?)
           OR (quarantined_at IS NOT NULL AND last_polled_at < ?)
         )
       ORDER BY datetime(COALESCE(last_polled_at, added_at)) ASC, added_at ASC
       LIMIT ?
     )
     RETURNING id, poll_claimed_at`
  ).bind(
    claimedAt,
    tier,
    claimExpiredBefore,
    dueBefore,
    quarantineRetryBefore,
    limit
  ).all<{ id: string; poll_claimed_at: string }>();
  return result.results ?? [];
}

export interface SourceDispatchResult {
  tier: PollTier;
  dispatched: number;
}

export async function dispatchDueSources(
  env: Env,
  now = new Date()
): Promise<SourceDispatchResult[]> {
  const results: SourceDispatchResult[] = [];
  for (const tier of queuedPollingTiers(env.QUEUE_POLLING_TIERS)) {
    const queue = tier === 1 ? env.SOURCE_POLL_PRIORITY_QUEUE : env.SOURCE_POLL_QUEUE;
    if (!queue) {
      throw new Error(`Polling tier ${tier} is queued but its queue binding is missing`);
    }

    const claimed = await claimDueSources(env.DB, tier, now);
    if (claimed.length === 0) {
      results.push({ tier, dispatched: 0 });
      continue;
    }

    try {
      await queue.sendBatch(claimed.map((row) => ({
        body: {
          companyId: row.id,
          tier,
          claimedAt: row.poll_claimed_at,
        } satisfies SourcePollMessage,
      })));
    } catch (error) {
      // Release the claims so the next tick retries immediately instead of
      // waiting out the claim TTL.
      await releaseClaims(env.DB, claimed);
      throw error;
    }
    results.push({ tier, dispatched: claimed.length });
  }
  return results;
}

async function releaseClaims(
  db: D1Database,
  claimed: Array<{ id: string; poll_claimed_at: string }>
): Promise<void> {
  await db.batch(claimed.map((row) =>
    db.prepare(
      "UPDATE companies SET poll_claimed_at = NULL WHERE id = ? AND poll_claimed_at = ?"
    ).bind(row.id, row.poll_claimed_at)
  )).catch(() => undefined);
}

export interface SourcePollDependencies {
  poll: typeof pollCompany;
  loadCustomTitles: typeof loadCustomTitles;
  decisionRecorder: typeof sourceDecisionRecorder;
  notifyAdmins: typeof notifyAdminsOfQuarantinedSources;
  /** Called after a poll persists new jobs for an enabled source. */
  onNewJobs: (env: Env, count: number) => Promise<void>;
}

const sourcePollDependencies: SourcePollDependencies = {
  poll: pollCompany,
  loadCustomTitles,
  decisionRecorder: sourceDecisionRecorder,
  notifyAdmins: notifyAdminsOfQuarantinedSources,
  onNewJobs: async () => undefined,
};

export type SourcePollResult =
  | { status: "polled"; newJobs: number; error: string | null }
  | { status: "skipped"; reason: "missing" | "stale_claim" | "not_queued" };

/**
 * Polls one claimed source. Adapter failures are recorded through the shared
 * quarantine logic and the message is still acknowledged: a queue retry would
 * only hammer a broken board, and the source's next cadence retries it anyway.
 * Only infrastructure failures (D1 writes) propagate, so the queue retries.
 */
export async function pollQueuedSource(
  env: Env,
  message: SourcePollMessage,
  dependencies: SourcePollDependencies = sourcePollDependencies,
  now = () => new Date()
): Promise<SourcePollResult> {
  const db = env.DB;
  const company = await db.prepare("SELECT * FROM companies WHERE id = ?")
    .bind(message.companyId)
    .first<CompanyRow>();
  if (!company) return { status: "skipped", reason: "missing" };
  // A redelivered message, or one whose claim expired and was re-issued,
  // must not poll the same source twice.
  if (company.poll_claimed_at !== message.claimedAt) {
    return { status: "skipped", reason: "stale_claim" };
  }

  const tier = (company.poll_tier ?? 1) as PollTier;
  if (company.enabled !== 1 || !queuedPollingTiers(env.QUEUE_POLLING_TIERS).has(tier)) {
    // Disabled, or the tier moved back to the cron path since dispatch.
    await db.prepare(
      "UPDATE companies SET poll_claimed_at = NULL WHERE id = ? AND poll_claimed_at = ?"
    ).bind(company.id, message.claimedAt).run();
    return { status: "skipped", reason: "not_queued" };
  }

  const startedAt = now().toISOString();
  const customTitles = await dependencies.loadCustomTitles(db);
  // Same classification audit and shadow sampling as the cron cycle, so
  // moving a tier onto the queue does not silently stop collecting decisions.
  const recordDecisions = await dependencies.decisionRecorder(
    db,
    env.JOB_CLASSIFICATION_AUDIT === "true" || env.JOB_CLASSIFICATION_SHADOW === "true",
    env.JOB_CLASSIFICATION_SHADOW === "true"
  );
  const result = await dependencies.poll(company, db, customTitles, {
    compactReturnMetadata: true,
    recordDecisions,
  }).then(
    (value): PromiseSettledResult<Awaited<ReturnType<typeof pollCompany>>> =>
      ({ status: "fulfilled", value }),
    (reason): PromiseSettledResult<Awaited<ReturnType<typeof pollCompany>>> =>
      ({ status: "rejected", reason })
  );
  const newJobs = result.status === "fulfilled" ? result.value.length : 0;
  // last_polled_at records when the poll started, so cadence is measured
  // start-to-start regardless of how long a large board takes.
  const outcome = companyPollOutcome(db, company, result, startedAt);

  await db.batch([
    outcome.statement,
    db.prepare(
      "UPDATE companies SET poll_claimed_at = NULL WHERE id = ? AND poll_claimed_at = ?"
    ).bind(company.id, message.claimedAt),
    sourcePollRecord(db, {
      company,
      tier,
      mode: "queue",
      startedAt,
      finishedAt: now().toISOString(),
      newJobs,
      error: outcome.error,
    }),
  ]);

  if (outcome.newlyQuarantined) {
    // Alerting must never fail the poll it reports on.
    await (async () => {
      const total = await db.prepare(
        "SELECT COUNT(*) AS count FROM companies WHERE quarantined_at IS NOT NULL"
      ).first<{ count: number }>();
      await dependencies.notifyAdmins(
        db,
        env,
        [outcome.newlyQuarantined!],
        total?.count ?? 1
      );
    })().catch((error) => {
      console.error("Quarantine alert failed:", error instanceof Error ? error.message : String(error));
    });
  }

  if (newJobs > 0) {
    await dependencies.onNewJobs(env, newJobs).catch((error) => {
      // The notification cron still drains the backlog; this only costs speed.
      console.error("New-job notification trigger failed:", error instanceof Error ? error.message : String(error));
    });
  }

  return { status: "polled", newJobs, error: outcome.error };
}

export async function handleSourcePollBatch(
  batch: MessageBatch<SourcePollMessage>,
  env: Env,
  dependencies: SourcePollDependencies = sourcePollDependencies
): Promise<void> {
  for (const message of batch.messages) {
    try {
      const result = await pollQueuedSource(env, message.body, dependencies);
      if (result.status === "polled") {
        console.log(
          `Source poll ${message.body.companyId} (tier ${message.body.tier}): `
          + (result.error ? `error ${result.error}` : `${result.newJobs} new`)
        );
      }
      message.ack();
    } catch (error) {
      console.error(
        `Source poll ${message.body.companyId} failed to record:`,
        error instanceof Error ? error.message : String(error)
      );
      message.retry();
    }
  }
}
