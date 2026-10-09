import {
  isDeadPushSubscription,
  resolveNotificationTransports,
  sendNotificationToSubscription,
} from "../notification-transport";
import type { NotificationPayload } from "../push";
import type { Env, PushSubscriptionRow } from "../types";

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
  const who = row.contact_name.trim().split(/\s+/)[0] || "the recruiter";
  return {
    title: `Follow up with ${row.company_name}`,
    body: row.step === 1
      ? `Your follow-up to ${who} is ready to send.`
      : `Your last follow-up to ${who} is ready to send.`,
    data: {
      url: row.job_id
        ? `/jobs/${row.job_id}?outreach=${row.thread_id}`
        : "/library/applied",
    },
  };
}

/** Pushes one reminder per follow-up that has come due. The user still sends
 * it from their own mail; this only tells them when. */
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
  if (rows.length === 0) return { reminded: 0, delivered: 0 };

  // Claim first, so an overlapping run or a failed push never sends twice.
  const stamp = now.toISOString();
  await env.DB.batch(rows.map((row) => env.DB.prepare(
    "UPDATE outreach_messages SET reminded_at = ? WHERE id = ? AND reminded_at IS NULL"
  ).bind(stamp, row.message_id)));

  const transports = resolveNotificationTransports(env);
  let delivered = 0;
  for (const row of rows) {
    const subscriptions = await env.DB.prepare(
      "SELECT * FROM push_subscriptions WHERE user_id = ?"
    ).bind(row.user_id).all<PushSubscriptionRow>();
    const payload = followUpReminderPayload(row);
    for (const subscription of subscriptions.results ?? []) {
      const result = await sendNotificationToSubscription(subscription, payload, transports);
      if (result.ok) {
        delivered += 1;
      } else if (isDeadPushSubscription(subscription, result)) {
        await env.DB.prepare("DELETE FROM push_subscriptions WHERE id = ?").bind(subscription.id).run();
      } else {
        console.error("Follow-up reminder push failed", {
          messageId: row.message_id,
          platform: subscription.platform,
          status: result.status,
          error: result.error,
        });
      }
    }
  }
  return { reminded: rows.length, delivered };
}
