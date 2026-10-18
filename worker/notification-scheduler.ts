// The every-minute tick's notification work, and the sweep that notices
// saved jobs closing (docs/backend-inventory-2026-10-16.md, step 2).

import { deliverPendingNotifications } from "./notification-delivery";
import { notifyActivity, recordActivity } from "./activity";
import {
  dailyDigestsDue,
  deliverDueNotifications,
  type DeliveryStats,
} from "./notifications";
import { remindDueFollowUps } from "./outreach/reminders";
import { queueDueReminders } from "./reminders";
import { runRequestedTestEmails } from "./email/test-emails";
import { CLOSE_AFTER_MISSES } from "./poller";
import type { Env } from "./types";

export interface SchedulerRun {
  followUps: number;
  /** N5 to N8 that came due. */
  reminders: number;
  digests: number;
  delivered: DeliveryStats;
}

/**
 * Follow-ups that came due are queued, once-a-day new-job alerts whose time
 * has come go out, then everything due in the log is delivered.
 */
export async function runNotificationScheduler(env: Env, now = new Date()): Promise<SchedulerRun> {
  // An admin's requested test-email run goes first, so its pushes go out this tick.
  await runRequestedTestEmails(env, now);
  const followUps = await remindDueFollowUps(env, now);
  const reminders = await queueDueReminders(env, now);
  const digests = await dailyDigestsDue(env.DB, now);
  const digestsSent = digests.length > 0
    ? await deliverPendingNotifications(env.DB, env, 500, { digests, now })
    : 0;
  const delivered = await deliverDueNotifications(env, now);
  return { followUps: followUps.queued, reminders, digests: digestsSent, delivered };
}

/** How far back a closing still gets a push; older ones are old news. */
const CLOSED_WITHIN_MS = 24 * 60 * 60 * 1000;

/**
 * N9: a job someone saved (and hasn't applied to) closed at the company.
 * It goes into the Activity stream (What changed) and the push starts there.
 * Only closings the poller saw count (the job missed enough polls); jobs
 * Pinkslip took out of its own catalog are still open where they're posted.
 */
export async function queueSavedJobClosings(env: Env, now = new Date()): Promise<number> {
  const rows = await env.DB.prepare(
    `SELECT a.id AS application_id, a.user_id, a.job_id, j.closed_at
     FROM jobs j
     JOIN applications a ON a.job_id = j.id
     WHERE j.closed_at IS NOT NULL
       AND j.closed_at > ?
       AND j.missed_polls >= ?
       AND a.stage = 'saved'
       AND a.user_id IS NOT NULL
     LIMIT 1000`
  ).bind(new Date(now.getTime() - CLOSED_WITHIN_MS).toISOString(), CLOSE_AFTER_MISSES)
    .all<{ application_id: string; user_id: string; job_id: string; closed_at: string }>();
  let queued = 0;
  for (const row of rows.results ?? []) {
    const activity = await recordActivity(env.DB, {
      userId: row.user_id,
      kind: "saved_job_closed",
      source: "system",
      applicationId: row.application_id,
      jobId: row.job_id,
      occurredAt: row.closed_at,
      dedupeKey: `saved_job_closed:${row.job_id}`,
    }, now);
    if (activity && await notifyActivity(env.DB, activity, now)) queued += 1;
  }
  return queued;
}
