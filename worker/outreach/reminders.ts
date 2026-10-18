import { followUpNotification } from "../notification-kinds";
import { notifyActivity, recordActivity } from "../activity";
import type { NotificationPayload } from "../push";
import type { Env } from "../types";

interface DueRow {
  message_id: string;
  thread_id: string;
  step: 1 | 2;
  user_id: string;
  job_id: string | null;
  company_name: string;
  contact_name: string;
}

export function followUpReminderPayload(row: Omit<DueRow, "message_id" | "user_id">): NotificationPayload {
  const { title, body, url } = followUpNotification(row);
  return { title, body, data: { url } };
}

/** Queues one reminder per follow-up that has come due; the every-minute
 * tick sends it right after (worker/notification-scheduler.ts), within the
 * daily cap. The user still sends the follow-up from their own mail; this
 * only tells them when. */
export async function remindDueFollowUps(env: Env, now = new Date(), limit = 100) {
  const due = await env.DB.prepare(
    `SELECT om.id AS message_id, om.thread_id, om.step, ot.user_id, ot.job_id,
            c.name AS company_name, cc.name AS contact_name
     FROM outreach_messages om
     JOIN outreach_threads ot ON ot.id = om.thread_id
     JOIN companies c ON c.id = ot.company_id
     JOIN company_contacts cc ON cc.id = ot.contact_id
     WHERE om.status = 'scheduled'
       AND om.reminded_at IS NULL
       AND om.due_at <= ?
       AND ot.status = 'active'
     ORDER BY om.due_at ASC
     LIMIT ?`
  ).bind(now.toISOString(), limit).all<DueRow>();
  const rows = due.results ?? [];
  if (rows.length === 0) return { reminded: 0, queued: 0 };

  // Claim first, so an overlapping run never queues twice.
  const stamp = now.toISOString();
  await env.DB.batch(rows.map((row) => env.DB.prepare(
    "UPDATE outreach_messages SET reminded_at = ? WHERE id = ? AND reminded_at IS NULL"
  ).bind(stamp, row.message_id)));

  let queued = 0;
  for (const row of rows) {
    const activity = await recordActivity(env.DB, {
      userId: row.user_id,
      kind: "follow_up_due",
      source: "system",
      jobId: row.job_id,
      threadId: row.thread_id,
      detail: { message_id: row.message_id, step: row.step },
      occurredAt: now,
      dedupeKey: `follow_up:${row.message_id}`,
    }, now);
    if (activity && await notifyActivity(env.DB, activity, now)) queued += 1;
  }
  return { reminded: rows.length, queued };
}
