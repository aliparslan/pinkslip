import { NOTIFICATION_MATCH_BATCH_SIZE, runNotificationCycle } from "./poller";
import type { Env } from "./types";

// A queued source poll that persists new jobs sends one message here, so
// matching and delivery start seconds after discovery instead of waiting for
// the next notification cron. The cron keeps running as the sweeper: every job
// still enters notification_match_backlog first, so a lost message only costs
// speed, never an alert.

export const NOTIFY_QUEUE_NAME = "pinkslip-notify";

export interface NotifyMessage {
  newJobs: number;
  queuedAt: string;
}

/**
 * The consumer runs with max_concurrency = 1, so a burst of messages collapses
 * into one batch. Keep draining while each cycle fills its matching batch, up
 * to a time budget that stays well inside the consumer's CPU limit.
 */
export const NOTIFY_DRAIN_BUDGET_MS = 60 * 1000;

export async function requestNotificationRun(env: Env, newJobs: number): Promise<void> {
  if (!env.NOTIFY_QUEUE) return;
  await env.NOTIFY_QUEUE.send({
    newJobs,
    queuedAt: new Date().toISOString(),
  } satisfies NotifyMessage);
}

export async function drainNotificationBacklog(
  env: Env,
  runCycle: typeof runNotificationCycle = runNotificationCycle,
  now = () => Date.now()
): Promise<{ matchesProcessed: number; notificationsSent: number }> {
  const startedAt = now();
  let matchesProcessed = 0;
  let notificationsSent = 0;
  for (;;) {
    const result = await runCycle(env);
    matchesProcessed += result.matchesProcessed;
    notificationsSent += result.notificationsSent;
    if (
      result.matchesProcessed < NOTIFICATION_MATCH_BATCH_SIZE
      || now() - startedAt >= NOTIFY_DRAIN_BUDGET_MS
    ) {
      return { matchesProcessed, notificationsSent };
    }
  }
}

export async function handleNotifyBatch(
  batch: MessageBatch<NotifyMessage>,
  env: Env,
  runCycle: typeof runNotificationCycle = runNotificationCycle
): Promise<void> {
  // Matching and delivery are idempotent (unique candidates, claimed
  // deliveries), so a failed run is simply retried as a whole.
  const result = await drainNotificationBacklog(env, runCycle);
  console.log(
    `Queued notification run: ${result.matchesProcessed} jobs matched, `
    + `${result.notificationsSent} notifications sent for ${batch.messages.length} trigger(s)`
  );
  batch.ackAll();
}
