import { isDeadApnsToken, resolveApnsConfig, sendApnsNotification } from "./apns";
import { recordProductEvent } from "./product-events";
import { buildNotificationPayload, sendPushNotification, type NotificationJob } from "./push";
import type { Env, PushSubscriptionRow } from "./types";

interface CandidateRow {
  id: string;
  user_id: string;
  job_id: string;
  company: string;
  title: string;
  attempt_count: number;
}

export function failureStatusAfterAttempt(
  previousAttemptCount: number
): "retry" | "failed" {
  return previousAttemptCount + 1 >= 3 ? "failed" : "retry";
}

export async function createNotificationCandidates(
  db: D1Database,
  jobIds: string[]
) {
  if (jobIds.length === 0) return 0;
  const placeholders = jobIds.map(() => "?").join(", ");
  const matches = await db.prepare(
    `SELECT
       ujm.user_id,
       ujm.job_id,
       ujm.score
     FROM user_job_matches ujm
     JOIN jobs j ON j.id = ujm.job_id
     JOIN user_search_profiles usp ON usp.user_id = ujm.user_id
     LEFT JOIN user_notification_settings uns ON uns.user_id = ujm.user_id
     WHERE ujm.job_id IN (${placeholders})
       AND COALESCE(uns.enabled, usp.notifications_enabled) = 1
       AND COALESCE(uns.push_enabled, 1) = 1
       AND ujm.score >= CAST(ROUND(COALESCE(uns.threshold, usp.match_threshold) * 0.95) AS INTEGER)
       AND NOT EXISTS (
         SELECT 1 FROM user_blocked_companies ubc
         WHERE ubc.user_id = ujm.user_id AND ubc.company_id = j.company_id
       )
       AND EXISTS (
         SELECT 1 FROM push_subscriptions ps
         WHERE ps.user_id = ujm.user_id
       )`
  ).bind(...jobIds).all<{ user_id: string; job_id: string; score: number }>();
  const rows = matches.results ?? [];
  if (rows.length === 0) return 0;

  const now = new Date().toISOString();
  let created = 0;
  for (let offset = 0; offset < rows.length; offset += 75) {
    const results = await db.batch(rows.slice(offset, offset + 75).map((row) =>
      db.prepare(
        `INSERT OR IGNORE INTO notification_candidates (
           id, user_id, job_id, channel, score, status, created_at
         ) VALUES (?, ?, ?, 'push', ?, 'pending', ?)`
      ).bind(crypto.randomUUID(), row.user_id, row.job_id, row.score, now)
    ));
    created += results.reduce((sum, result) => sum + (result.meta.changes ?? 0), 0);
  }
  return created;
}

export async function deliverPendingNotifications(
  db: D1Database,
  env: Env,
  limit = 200
) {
  await db.prepare(
    `UPDATE notification_candidates
     SET status = CASE WHEN attempt_count >= 3 THEN 'failed' ELSE 'retry' END,
         last_error = COALESCE(last_error, 'Delivery claim expired')
     WHERE status = 'sending'
       AND datetime(last_attempt_at) < datetime('now', '-10 minutes')`
  ).run();

  const candidates = await db.prepare(
    `SELECT nc.id, nc.user_id, nc.job_id, c.name AS company, j.title, nc.attempt_count
     FROM notification_candidates nc
     JOIN jobs j ON j.id = nc.job_id
     JOIN companies c ON c.id = j.company_id
     LEFT JOIN user_notification_settings uns ON uns.user_id = nc.user_id
     JOIN user_search_profiles usp ON usp.user_id = nc.user_id
     WHERE nc.status IN ('pending', 'retry')
       AND nc.attempt_count < 3
       AND COALESCE(uns.enabled, usp.notifications_enabled) = 1
       AND COALESCE(uns.push_enabled, 1) = 1
       AND nc.score >= CAST(ROUND(COALESCE(uns.threshold, usp.match_threshold) * 0.95) AS INTEGER)
       AND NOT EXISTS (
         SELECT 1 FROM user_blocked_companies ubc
         WHERE ubc.user_id = nc.user_id AND ubc.company_id = j.company_id
       )
     ORDER BY datetime(nc.created_at) ASC
     LIMIT ?`
  ).bind(limit).all<CandidateRow>();
  const available = candidates.results ?? [];
  if (available.length === 0) return 0;

  const claimedAt = new Date().toISOString();
  const claimResults = await db.batch(available.map((candidate) =>
    db.prepare(
      `UPDATE notification_candidates
       SET status = 'sending', attempt_count = attempt_count + 1, last_attempt_at = ?
       WHERE id = ? AND status IN ('pending', 'retry') AND attempt_count < 3`
    ).bind(claimedAt, candidate.id)
  ));
  const rows = available.filter((_, index) => (claimResults[index].meta.changes ?? 0) > 0);
  if (rows.length === 0) return 0;

  const byUser = new Map<string, CandidateRow[]>();
  for (const row of rows) {
    byUser.set(row.user_id, [...(byUser.get(row.user_id) ?? []), row]);
  }
  const deliveries: Array<[string, CandidateRow[]]> = [];
  for (const [userId, userCandidates] of byUser) {
    for (let offset = 0; offset < userCandidates.length; offset += 20) {
      deliveries.push([userId, userCandidates.slice(offset, offset + 20)]);
    }
  }

  const vapid = {
    subject: env.VAPID_SUBJECT,
    publicKey: env.VAPID_PUBLIC_KEY,
    privateKey: env.VAPID_PRIVATE_KEY,
  };
  const apnsConfig = resolveApnsConfig(env);
  let sent = 0;

  for (const [userId, userCandidates] of deliveries) {
    const subscriptions = await db.prepare(
      "SELECT * FROM push_subscriptions WHERE user_id = ?"
    ).bind(userId).all<PushSubscriptionRow>();
    const subs = subscriptions.results ?? [];
    if (subs.length === 0) {
      await markCandidates(db, userCandidates, "skipped", "No registered push subscription");
      continue;
    }

    const jobs: NotificationJob[] = userCandidates.map((candidate) => ({
      company: candidate.company,
      title: candidate.title,
      jobId: candidate.job_id,
    }));
    const payload = buildNotificationPayload(jobs);
    const results = await Promise.allSettled(subs.map((sub) =>
      sub.platform === "ios" && apnsConfig
        ? sendApnsNotification(sub.endpoint, payload, apnsConfig)
        : sendPushNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            payload,
            vapid
          )
    ));
    const succeeded = results.some((result) => result.status === "fulfilled" && result.value.ok);
    if (succeeded) {
      await db.batch(userCandidates.map((candidate) =>
        db.prepare(
          `UPDATE notification_candidates
           SET status = 'sent', sent_at = ?, last_error = NULL
           WHERE id = ?`
        ).bind(new Date().toISOString(), candidate.id)
      ));
      sent += userCandidates.length;
      for (const candidate of userCandidates) {
        await recordProductEvent(db, {
          userId,
          name: "notification_sent",
          entityType: "job",
          entityId: candidate.job_id,
        }).catch(() => undefined);
      }
    } else {
      const error = results
        .map((result) => result.status === "rejected"
          ? String(result.reason)
          : result.value.ok ? "" : `Push service returned ${result.value.status}`)
        .filter(Boolean)
        .join("; ")
        .slice(0, 1000);
      const retryable = userCandidates.filter(
        (candidate) => failureStatusAfterAttempt(candidate.attempt_count) === "retry"
      );
      const exhausted = userCandidates.filter(
        (candidate) => failureStatusAfterAttempt(candidate.attempt_count) === "failed"
      );
      if (retryable.length > 0) {
        await markCandidates(db, retryable, "retry", error || "Push delivery failed");
      }
      if (exhausted.length > 0) {
        await markCandidates(db, exhausted, "failed", error || "Push delivery failed");
      }
    }

    for (let index = 0; index < results.length; index++) {
      const result = results[index];
      if (result.status !== "fulfilled" || result.value.ok) continue;
      const sub = subs[index];
      const dead = sub.platform === "ios"
        ? isDeadApnsToken(result.value.status)
        : result.value.status === 404 || result.value.status === 410;
      if (dead) {
        await db.prepare("DELETE FROM push_subscriptions WHERE endpoint = ?")
          .bind(sub.endpoint)
          .run();
      }
    }
  }
  return sent;
}

async function markCandidates(
  db: D1Database,
  candidates: CandidateRow[],
  status: "retry" | "failed" | "skipped",
  error: string
) {
  await db.batch(candidates.map((candidate) =>
    db.prepare(
      `UPDATE notification_candidates
       SET status = ?, last_error = ?
       WHERE id = ?`
    ).bind(status, error.slice(0, 1000), candidate.id)
  ));
}
