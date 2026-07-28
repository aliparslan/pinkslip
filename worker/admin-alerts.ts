// ─── Operational alerts for admins ───────────────────────────────────────────
//
// The system has always known when a source breaks — `companies.last_poll_error`
// has recorded it faithfully — but nothing ever told anyone. That is how 34 dead
// slugs quietly became 46 over six weeks. Quarantine stops the wasted requests;
// this closes the loop by actually saying so.
//
// Deliberately NOT routed through notification_candidates: that table is
// job-scoped (`job_id` is NOT NULL with an FK to jobs), and operational alerts
// have no job. Sending directly keeps the two concerns separate.

import { isDeadApnsToken, resolveApnsConfig, sendApnsNotification } from "./apns";
import { sendPushNotification, type NotificationPayload } from "./push";
import type { Env, PushSubscriptionRow } from "./types";

export interface QuarantinedSource {
  name: string;
  error: string | null;
}

/**
 * Builds the alert body.
 *
 * Names the actual companies rather than only a count, because the first thing
 * you want to know is whether it is one obscure board or something central.
 */
export function buildSourceAlertPayload(
  newlyQuarantined: QuarantinedSource[],
  totalQuarantined: number
): NotificationPayload {
  const count = newlyQuarantined.length;
  const names = newlyQuarantined.slice(0, 3).map((source) => source.name);
  const listed = count > 3 ? `${names.join(", ")} +${count - 3} more` : names.join(", ");

  return {
    title: count === 1
      ? "1 job source stopped working"
      : `${count} job sources stopped working`,
    body: `${listed} — ${totalQuarantined} total need fixing`,
    data: { url: "/you/companies" },
  };
}

/**
 * Pushes an operational alert to every admin with a registered device.
 *
 * Respects `push_enabled` (an explicit "do not push me") but intentionally not
 * the job-alert `enabled` switch — turning off job alerts should not silently
 * also turn off "your ingestion is broken".
 */
export async function notifyAdminsOfQuarantinedSources(
  db: D1Database,
  env: Env,
  newlyQuarantined: QuarantinedSource[],
  totalQuarantined: number
): Promise<number> {
  if (newlyQuarantined.length === 0) return 0;

  const subscriptions = await db.prepare(
    `SELECT ps.*
     FROM push_subscriptions ps
     JOIN users u ON u.id = ps.user_id
     LEFT JOIN user_notification_settings uns ON uns.user_id = ps.user_id
     WHERE u.role = 'admin'
       AND COALESCE(uns.push_enabled, 1) = 1`
  ).all<PushSubscriptionRow>();

  const subs = subscriptions.results ?? [];
  if (subs.length === 0) return 0;

  const payload = buildSourceAlertPayload(newlyQuarantined, totalQuarantined);
  const apnsConfig = resolveApnsConfig(env);
  const vapid = {
    subject: env.VAPID_SUBJECT,
    publicKey: env.VAPID_PUBLIC_KEY,
    privateKey: env.VAPID_PRIVATE_KEY,
  };

  let sent = 0;
  for (const sub of subs) {
    const result = await (async () => {
      try {
        if (sub.platform === "ios") {
          if (!apnsConfig) return { ok: false as const, status: 0 };
          return await sendApnsNotification(sub.endpoint, payload, apnsConfig);
        }
        return await sendPushNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload,
          vapid
        );
      } catch (error) {
        return {
          ok: false as const,
          status: 0,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    })();

    if (result.ok) {
      sent += 1;
      continue;
    }

    // Same dead-token cleanup as job delivery, so a stale admin device does not
    // accumulate failures forever.
    const dead = sub.platform === "ios"
      ? isDeadApnsToken(result.status, "body" in result ? result.body : undefined)
      : result.status === 404 || result.status === 410;
    if (dead) {
      await db.prepare("DELETE FROM push_subscriptions WHERE id = ?")
        .bind(sub.id)
        .run()
        .catch(() => undefined);
    }
  }

  return sent;
}
