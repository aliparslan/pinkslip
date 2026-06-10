import { isDeadApnsToken, resolveApnsConfig, sendApnsNotification } from "./apns";
import { recordProductEvent } from "./product-events";
import { buildNotificationPayload, sendPushNotification, type NotificationJob } from "./push";
import type { Env, PushSubscriptionRow } from "./types";
import { ensureEligibleJobs } from "./job-scope";

interface CandidateRow {
  id: string;
  user_id: string;
  job_id: string;
  company: string;
  title: string;
  attempt_count: number;
}

interface DeliveryRow {
  candidate_id: string;
  subscription_id: string;
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
  await ensureEligibleJobs(db);
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
       AND j.closed_at IS NULL
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
        `INSERT INTO notification_candidates (
           id, user_id, job_id, channel, score, status, created_at
         ) VALUES (?, ?, ?, 'push', ?, 'pending', ?)
         ON CONFLICT(user_id, job_id, channel) DO UPDATE SET
           score = excluded.score,
           status = 'pending',
           attempt_count = 0,
           last_error = NULL,
           last_attempt_at = NULL,
           sent_at = NULL
         WHERE notification_candidates.status IN ('failed', 'skipped')`
      ).bind(crypto.randomUUID(), row.user_id, row.job_id, row.score, now)
    ));
    created += results.reduce((sum, result) => sum + (result.meta.changes ?? 0), 0);
  }
  await db.prepare(
    `UPDATE notification_deliveries
     SET status = 'retry', attempt_count = 0, last_error = NULL
     WHERE status = 'failed'
       AND candidate_id IN (
         SELECT id FROM notification_candidates
         WHERE status = 'pending' AND job_id IN (${placeholders})
       )`
  ).bind(...jobIds).run();
  return created;
}

export async function deliverPendingNotifications(
  db: D1Database,
  env: Env,
  limit = 200
) {
  await ensureEligibleJobs(db);
  await db.prepare(
    `UPDATE notification_candidates
     SET status = CASE WHEN attempt_count >= 3 THEN 'failed' ELSE 'retry' END,
         last_error = COALESCE(last_error, 'Delivery claim expired')
     WHERE status = 'sending'
       AND datetime(last_attempt_at) < datetime('now', '-10 minutes')`
  ).run();
  await db.prepare(
    `UPDATE notification_deliveries
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
       AND j.closed_at IS NULL
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
       WHERE id = ? AND status IN ('pending', 'retry')`
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

    await db.batch(userCandidates.flatMap((candidate) =>
      subs.map((sub) =>
        db.prepare(
          `INSERT OR IGNORE INTO notification_deliveries (
             candidate_id, subscription_id, status
           ) VALUES (?, ?, 'pending')`
        ).bind(candidate.id, sub.id)
      )
    ));

    const candidateById = new Map(userCandidates.map((candidate) => [candidate.id, candidate]));
    const candidatePlaceholders = userCandidates.map(() => "?").join(", ");
    const deliveryRows = await db.prepare(
      `SELECT candidate_id, subscription_id, attempt_count
       FROM notification_deliveries
       WHERE candidate_id IN (${candidatePlaceholders})
         AND status IN ('pending', 'retry')
         AND attempt_count < 3`
    ).bind(...userCandidates.map((candidate) => candidate.id)).all<DeliveryRow>();

    for (const sub of subs) {
      const pending = (deliveryRows.results ?? [])
        .filter((delivery) => delivery.subscription_id === sub.id);
      if (pending.length === 0) continue;

      const deliveryClaimedAt = new Date().toISOString();
      const claims = await db.batch(pending.map((delivery) =>
        db.prepare(
          `UPDATE notification_deliveries
           SET status = 'sending', attempt_count = attempt_count + 1, last_attempt_at = ?
           WHERE candidate_id = ? AND subscription_id = ?
             AND status IN ('pending', 'retry') AND attempt_count < 3`
        ).bind(deliveryClaimedAt, delivery.candidate_id, delivery.subscription_id)
      ));
      const claimed = pending.filter((_, index) => (claims[index].meta.changes ?? 0) > 0);
      if (claimed.length === 0) continue;

      const jobs: NotificationJob[] = claimed
        .map((delivery) => candidateById.get(delivery.candidate_id))
        .filter((candidate): candidate is CandidateRow => Boolean(candidate))
        .map((candidate) => ({
          company: candidate.company,
          title: candidate.title,
          jobId: candidate.job_id,
        }));
      const payload = buildNotificationPayload(jobs);
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
        await db.batch(claimed.map((delivery) =>
          db.prepare(
            `UPDATE notification_deliveries
             SET status = 'sent', sent_at = ?, last_error = NULL
             WHERE candidate_id = ? AND subscription_id = ?`
          ).bind(new Date().toISOString(), delivery.candidate_id, delivery.subscription_id)
        ));
      } else {
        await db.batch(claimed.map((delivery) =>
          db.prepare(
            `UPDATE notification_deliveries
             SET status = ?, last_error = ?
             WHERE candidate_id = ? AND subscription_id = ?`
          ).bind(
            failureStatusAfterAttempt(delivery.attempt_count),
            ("error" in result && result.error
              ? result.error
              : `Push service returned ${result.status}`).slice(0, 1000),
            delivery.candidate_id,
            delivery.subscription_id
          )
        ));
        const dead = sub.platform === "ios"
          ? isDeadApnsToken(result.status)
          : result.status === 404 || result.status === 410;
        if (dead) {
          await db.prepare("DELETE FROM push_subscriptions WHERE id = ?")
            .bind(sub.id)
            .run();
        }
      }
    }

    for (const candidate of userCandidates) {
      const state = await db.prepare(
        `SELECT
           COUNT(*) AS total,
           SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) AS sent_count,
           SUM(CASE WHEN status IN ('pending', 'retry', 'sending') THEN 1 ELSE 0 END) AS active_count
         FROM notification_deliveries
         WHERE candidate_id = ?`
      ).bind(candidate.id).first<{ total: number; sent_count: number; active_count: number }>();
      const total = state?.total ?? 0;
      const sentCount = state?.sent_count ?? 0;
      const activeCount = state?.active_count ?? 0;

      if (activeCount > 0) {
        await markCandidates(db, [candidate], "retry", "Some registered devices still need delivery");
      } else if (sentCount > 0) {
        await db.prepare(
          `UPDATE notification_candidates
           SET status = 'sent', sent_at = ?, last_error = NULL
           WHERE id = ?`
        ).bind(new Date().toISOString(), candidate.id).run();
        sent += 1;
        await recordProductEvent(db, {
          userId,
          name: "notification_sent",
          entityType: "job",
          entityId: candidate.job_id,
        }).catch(() => undefined);
      } else {
        await markCandidates(
          db,
          [candidate],
          total === 0 ? "skipped" : "failed",
          total === 0 ? "No registered push subscription" : "Delivery failed on every registered device"
        );
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
