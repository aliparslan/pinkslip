// The every-minute tick's notification work, and the sweep that notices
// saved jobs closing (docs/backend-inventory-2026-10-16.md, step 2).

import { deliverPendingNotifications } from "./notification-delivery";
import { savedJobClosedNotification } from "./notification-kinds";
import {
  dailyDigestsDue,
  deliverDueNotifications,
  scheduleNotification,
  type DeliveryStats,
} from "./notifications";
import { remindDueFollowUps } from "./outreach/reminders";
import { CLOSE_AFTER_MISSES } from "./poller";
import type { Env } from "./types";

export interface SchedulerRun {
  followUps: number;
  digests: number;
  delivered: DeliveryStats;
}

/**
 * Follow-ups that came due are queued, once-a-day new-job alerts whose time
 * has come go out, then everything due in the log is delivered.
 */
export async function runNotificationScheduler(env: Env, now = new Date()): Promise<SchedulerRun> {
  const followUps = await remindDueFollowUps(env, now);
  const digests = await dailyDigestsDue(env.DB, now);
  const digestsSent = digests.length > 0
    ? await deliverPendingNotifications(env.DB, env, 500, { digests, now })
    : 0;
  const delivered = await deliverDueNotifications(env, now);
  return { followUps: followUps.queued, digests: digestsSent, delivered };
}

/** How far back a closing still gets a push; older ones are old news. */
const CLOSED_WITHIN_MS = 24 * 60 * 60 * 1000;

/**
 * N9: a job someone saved (and hasn't applied to) closed at the company.
 * Only closings the poller saw count (the job missed enough polls); jobs
 * Pinkslip took out of its own catalog are still open where they're posted.
 */
export async function queueSavedJobClosings(env: Env, now = new Date()): Promise<number> {
  const rows = await env.DB.prepare(
    `SELECT a.user_id, a.job_id, a.company_name, a.title
     FROM jobs j
     JOIN applications a ON a.job_id = j.id
     WHERE j.closed_at IS NOT NULL
       AND j.closed_at > ?
       AND j.missed_polls >= ?
       AND a.stage = 'saved'
       AND a.user_id IS NOT NULL
     LIMIT 1000`
  ).bind(new Date(now.getTime() - CLOSED_WITHIN_MS).toISOString(), CLOSE_AFTER_MISSES)
    .all<{ user_id: string; job_id: string; company_name: string; title: string }>();
  let queued = 0;
  for (const row of rows.results ?? []) {
    const content = savedJobClosedNotification({ jobId: row.job_id, company: row.company_name, title: row.title });
    if (await scheduleNotification(env.DB, {
      userId: row.user_id,
      kind: "saved_job_closed",
      dedupeKey: `saved_job_closed:${row.job_id}`,
      ...content,
      entityType: "job",
      entityId: row.job_id,
    }, now)) queued += 1;
  }
  return queued;
}
