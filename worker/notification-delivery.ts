import { needsYouCount, recordActivity } from "./activity";
import { apnsReason } from "./apns";
import { recordProductEvent } from "./product-events";
import { buildDailyDigestPayload, buildNotificationPayload, type NotificationJob, type NotificationPayload } from "./push";
import {
  recordSentNotification,
  type DueDigest,
} from "./notifications";
import type { Env, PushSubscriptionRow } from "./types";
import { ensureEligibleJobs } from "./job-scope";
import {
  JOB_CLASSIFIER_VERSION,
  rowToListing,
  storedJobFeaturesFromRow,
  type FeatureJobRow,
  type JobFeatures,
  type StoredJobFeatureColumns,
} from "./job-features";
import { evaluateJobForProfile, MATCHER_VERSION } from "./user-job-matches";
import {
  searchProfileFromRow,
  type SearchProfileRow,
} from "./user-preferences";
import { MAX_POSTED_AGE_DAYS } from "../shared/job-policy";
import type { SearchProfile } from "../shared/search-profile";
import type { JobListing } from "./adapters/types";
import {
  isDeadPushSubscription,
  resolveNotificationTransports,
  sendNotificationToSubscription,
} from "./notification-transport";

interface CandidateRow extends FeatureJobRow, StoredJobFeatureColumns, SearchProfileRow {
  candidate_id: string;
  user_id: string;
  job_id: string;
  company: string;
  attempt_count: number;
  evergreen: number | null;
  /** The person follows the job's company (N20). */
  followed: number;
}

export function notificationJobMatchesCurrentProfile(
  jobId: string,
  listing: JobListing,
  features: JobFeatures,
  profile: SearchProfile,
  evergreen = false,
  followed = false
): boolean {
  return evaluateJobForProfile(
    jobId,
    listing,
    features,
    profile,
    evergreen,
    followed
  ).plausible;
}

function notificationCandidateMatchesCurrentProfile(candidate: CandidateRow): boolean {
  if (candidate.classifier_version !== JOB_CLASSIFIER_VERSION) return false;
  return notificationJobMatchesCurrentProfile(
    candidate.job_id,
    rowToListing(candidate),
    storedJobFeaturesFromRow(candidate),
    searchProfileFromRow(candidate),
    candidate.evergreen === 1,
    candidate.followed === 1
  );
}

interface DeliveryRow {
  candidate_id: string;
  subscription_id: string;
  attempt_count: number;
}

const NOTIFICATION_JOB_ID_BATCH_SIZE = 75;

export function notificationJobIdBatches(jobIds: string[]): string[][] {
  const uniqueJobIds = [...new Set(jobIds)];
  const batches: string[][] = [];
  for (
    let offset = 0;
    offset < uniqueJobIds.length;
    offset += NOTIFICATION_JOB_ID_BATCH_SIZE
  ) {
    batches.push(uniqueJobIds.slice(offset, offset + NOTIFICATION_JOB_ID_BATCH_SIZE));
  }
  return batches;
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
  const now = new Date().toISOString();
  let created = 0;
  for (const ids of notificationJobIdBatches(jobIds)) {
    const placeholders = ids.map(() => "?").join(", ");
    const matches = await db.prepare(
      `SELECT
         ujm.user_id,
         ujm.job_id
       FROM user_job_matches ujm
       JOIN jobs j ON j.id = ujm.job_id
       JOIN user_search_profiles usp ON usp.user_id = ujm.user_id
       LEFT JOIN user_notification_settings uns ON uns.user_id = ujm.user_id
       LEFT JOIN notification_settings ns ON ns.user_id = ujm.user_id AND ns.kind = 'new_jobs'
       WHERE ujm.job_id IN (${placeholders})
         AND ujm.matcher_version = ?
         AND j.closed_at IS NULL
         AND j.description IS NOT NULL
         AND trim(j.description) != ''
         AND (j.posted_at IS NULL OR datetime(j.posted_at) > datetime('now', '-${MAX_POSTED_AGE_DAYS + 1} days'))
         AND COALESCE(ns.enabled, uns.enabled, usp.notifications_enabled) = 1
         AND COALESCE(uns.push_enabled, 1) = 1
         AND NOT EXISTS (
           SELECT 1 FROM user_blocked_companies ubc
           WHERE ubc.user_id = ujm.user_id AND ubc.company_id = j.company_id
         )
         AND EXISTS (
           SELECT 1 FROM push_subscriptions ps
           WHERE ps.user_id = ujm.user_id
         )`
    ).bind(...ids, MATCHER_VERSION).all<{ user_id: string; job_id: string }>();
    const rows = matches.results ?? [];
    if (rows.length === 0) continue;

    for (
      let offset = 0;
      offset < rows.length;
      offset += NOTIFICATION_JOB_ID_BATCH_SIZE
    ) {
      const results = await db.batch(
        rows.slice(offset, offset + NOTIFICATION_JOB_ID_BATCH_SIZE).map((row) =>
          db.prepare(
            `INSERT INTO notification_candidates (
               id, user_id, job_id, channel, status, created_at
             ) VALUES (?, ?, ?, 'push', 'pending', ?)
             ON CONFLICT(user_id, job_id, channel) DO UPDATE SET
               status = 'pending',
               attempt_count = 0,
               last_error = NULL,
               last_attempt_at = NULL,
               sent_at = NULL
             WHERE notification_candidates.status IN ('failed', 'skipped')`
          ).bind(crypto.randomUUID(), row.user_id, row.job_id, now)
        )
      );
      created += results.reduce(
        (sum, result) => sum + (result.meta.changes ?? 0),
        0
      );
    }

    await db.prepare(
      `UPDATE notification_deliveries
       SET status = 'retry', attempt_count = 0, last_error = NULL
       WHERE status = 'failed'
         AND candidate_id IN (
           SELECT id FROM notification_candidates
           WHERE status = 'pending' AND job_id IN (${placeholders})
         )`
    ).bind(...ids).run();
  }
  return created;
}

export interface DeliverOptions {
  /** Once-a-day people whose time has come; without it, only people on "as they post". */
  digests?: DueDigest[];
  now?: Date;
  send?: typeof sendNotificationToSubscription;
}

/** The most jobs one push covers; any more wait for the person's next push. */
const JOBS_PER_PUSH = 100;

export async function deliverPendingNotifications(
  db: D1Database,
  env: Env,
  limit = 200,
  options: DeliverOptions = {}
) {
  const now = options.now ?? new Date();
  const send = options.send ?? sendNotificationToSubscription;
  const digests = options.digests ?? [];
  const digestKeys = new Map(digests.map((digest) => [digest.userId, digest.dedupeKey]));
  if (options.digests && digests.length === 0) return 0;
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
  // A profile edit deletes its cached matches before rebuilding them. Do not
  // let a notification queued under the old profile leak through in between.
  await db.prepare(
    `UPDATE notification_candidates AS nc
     SET status = 'skipped', last_error = 'No longer matches preferences'
     WHERE nc.status IN ('pending', 'retry')
       AND NOT EXISTS (
         SELECT 1
         FROM user_job_matches ujm
         JOIN jobs j ON j.id = ujm.job_id
         WHERE ujm.user_id = nc.user_id
           AND ujm.job_id = nc.job_id
           AND ujm.matcher_version = ?
           AND j.closed_at IS NULL
           AND j.description IS NOT NULL
           AND trim(j.description) != ''
           AND (j.posted_at IS NULL OR datetime(j.posted_at) > datetime('now', '-${MAX_POSTED_AGE_DAYS + 1} days'))
       )`
  ).bind(MATCHER_VERSION).run();

  const candidates = await db.prepare(
    `SELECT nc.id AS candidate_id, nc.user_id, nc.job_id,
            c.name AS company, nc.attempt_count,
            j.id, j.external_id, j.title, j.url, j.location, j.department,
            j.posted_at, j.first_seen_at, j.description, j.salary, j.evergreen,
            jf.role_family, jf.specialties_json, jf.seniority, jf.min_years,
            jf.max_years, jf.work_mode, jf.countries_json, jf.metro_areas_json,
            jf.salary_min, jf.salary_max, jf.salary_currency, jf.salary_period,
            jf.sponsorship_available, jf.requires_advanced_degree,
            jf.requires_security_clearance, jf.qualification_requirements_json, jf.classifier_version, jf.confidence,
            usp.profile_json, usp.notifications_enabled,
            usp.onboarding_version, usp.onboarding_completed_at,
            CAST(EXISTS(
              SELECT 1 FROM company_follows cf
              WHERE cf.user_id = nc.user_id AND cf.company_id = j.company_id
            ) AS INTEGER) AS followed
     FROM notification_candidates nc
     JOIN jobs j ON j.id = nc.job_id
     JOIN companies c ON c.id = j.company_id
     JOIN job_features jf ON jf.job_id = j.id
     JOIN user_job_matches ujm
       ON ujm.user_id = nc.user_id
      AND ujm.job_id = nc.job_id
      AND ujm.matcher_version = ?
     LEFT JOIN user_notification_settings uns ON uns.user_id = nc.user_id
     LEFT JOIN notification_settings ns ON ns.user_id = nc.user_id AND ns.kind = 'new_jobs'
     JOIN user_search_profiles usp ON usp.user_id = nc.user_id
     LEFT JOIN job_review_queue jrq ON jrq.job_id = j.id
     WHERE nc.status IN ('pending', 'retry')
       AND j.closed_at IS NULL
       AND j.description IS NOT NULL
       AND trim(j.description) != ''
       AND jf.classifier_version = ?
       AND (jrq.job_id IS NULL OR jrq.state = 'approved')
       AND (j.posted_at IS NULL OR datetime(j.posted_at) > datetime('now', '-${MAX_POSTED_AGE_DAYS + 1} days'))
       AND COALESCE(ns.enabled, uns.enabled, usp.notifications_enabled) = 1
       AND COALESCE(uns.push_enabled, 1) = 1
       AND NOT EXISTS (
         SELECT 1 FROM user_blocked_companies ubc
         WHERE ubc.user_id = nc.user_id AND ubc.company_id = j.company_id
       )
       -- Once-a-day people wait for their digest. New-job alerts don't wait
       -- for the daily cap: how often is the person's choice (UNCAPPED_KINDS).
       AND ${options.digests
         ? `nc.user_id IN (${digests.map(() => "?").join(", ")})`
         : "COALESCE(ns.mode, 'post') = 'post'"}
     ORDER BY nc.created_at ASC
     LIMIT ?`
  ).bind(
    MATCHER_VERSION,
    JOB_CLASSIFIER_VERSION,
    ...digests.map((digest) => digest.userId),
    limit
  ).all<CandidateRow>();
  const available: CandidateRow[] = [];
  const preferenceMismatches: CandidateRow[] = [];
  for (const candidate of candidates.results ?? []) {
    (notificationCandidateMatchesCurrentProfile(candidate)
      ? available
      : preferenceMismatches).push(candidate);
  }
  if (preferenceMismatches.length > 0) {
    await db.batch(preferenceMismatches.map((candidate) => db.prepare(
      `UPDATE notification_candidates
       SET status = 'skipped', last_error = 'No longer matches live preferences'
       WHERE id = ? AND status IN ('pending', 'retry')`
    ).bind(candidate.candidate_id)));
  }
  if (available.length === 0) return 0;

  // One push per person per run: a person's jobs past the first
  // JOBS_PER_PUSH stay queued for their next one instead of a second push now.
  const perUser = new Map<string, number>();
  const batch = available.filter((candidate) => {
    const count = (perUser.get(candidate.user_id) ?? 0) + 1;
    perUser.set(candidate.user_id, count);
    return count <= JOBS_PER_PUSH;
  });

  const claimedAt = new Date().toISOString();
  const claimResults = await db.batch(batch.map((candidate) =>
    db.prepare(
      `UPDATE notification_candidates
       SET status = 'sending', attempt_count = attempt_count + 1, last_attempt_at = ?
       WHERE id = ? AND status IN ('pending', 'retry')`
    ).bind(claimedAt, candidate.candidate_id)
  ));
  const rows = batch.filter((_, index) => (claimResults[index].meta.changes ?? 0) > 0);
  if (rows.length === 0) return 0;

  const byUser = new Map<string, CandidateRow[]>();
  for (const row of rows) {
    byUser.set(row.user_id, [...(byUser.get(row.user_id) ?? []), row]);
  }
  // One push per person per run, so five jobs landing together are one
  // alert, not five.
  const deliveries = [...byUser.entries()];

  const transports = resolveNotificationTransports(env);
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

    const notificationId = crypto.randomUUID();
    const digestKey = digestKeys.get(userId);
    if (digestKey) {
      // Claims the day, so two overlapping ticks can't both send it.
      const claim = await db.prepare(
        `INSERT OR IGNORE INTO notification_log (
           id, user_id, kind, dedupe_key, title, body, url, passive, status, scheduled_for, created_at
         ) VALUES (?, ?, 'new_jobs', ?, '', '', '/', 1, 'sending', ?, ?)`
      ).bind(notificationId, userId, digestKey, now.toISOString(), now.toISOString()).run();
      if ((claim.meta?.changes ?? 0) === 0) {
        await markCandidates(db, userCandidates, "retry", "Today's digest already went out");
        continue;
      }
    }
    let delivered: NotificationPayload | null = null;
    let devicesSent = 0;
    // The app icon shows what needs the person, set with every push.
    const badge = await needsYouCount(db, userId, now);

    await db.batch(userCandidates.flatMap((candidate) =>
      subs.map((sub) =>
        db.prepare(
          `INSERT OR IGNORE INTO notification_deliveries (
             candidate_id, subscription_id, status
           ) VALUES (?, ?, 'pending')`
        ).bind(candidate.candidate_id, sub.id)
      )
    ));

    const candidateById = new Map(userCandidates.map((candidate) => [candidate.candidate_id, candidate]));
    const candidatePlaceholders = userCandidates.map(() => "?").join(", ");
    const deliveryRows = await db.prepare(
      `SELECT candidate_id, subscription_id, attempt_count
       FROM notification_deliveries
       WHERE candidate_id IN (${candidatePlaceholders})
         AND status IN ('pending', 'retry')
         AND attempt_count < 3`
    ).bind(...userCandidates.map((candidate) => candidate.candidate_id)).all<DeliveryRow>();

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
          following: candidate.followed === 1,
        }));
      const payload: NotificationPayload = {
        ...(digestKey ? buildDailyDigestPayload(jobs) : buildNotificationPayload(jobs)),
        kind: "new_jobs",
        badge,
      };
      payload.data.notification_id = notificationId;
      const result = await send(sub, payload, transports);

      if (result.ok) {
        delivered ??= payload;
        devicesSent += 1;
        await db.batch(claimed.map((delivery) =>
          db.prepare(
            `UPDATE notification_deliveries
             SET status = 'sent', sent_at = ?, last_error = NULL
             WHERE candidate_id = ? AND subscription_id = ?`
          ).bind(new Date().toISOString(), delivery.candidate_id, delivery.subscription_id)
        ));
      } else {
        // APNs puts its actual diagnosis in the body ({"reason":"BadDeviceToken"}),
        // and we were fetching it and discarding it — leaving only a bare status,
        // which cannot distinguish a dead token from a request we malformed.
        const reason = sub.platform === "ios" ? apnsReason(result.body) : null;
        const failureDetail = ("error" in result && result.error
          ? result.error
          : `Push service returned ${result.status}${reason ? ` (${reason})` : ""}`
        ).slice(0, 1000);

        await db.batch(claimed.map((delivery) =>
          db.prepare(
            `UPDATE notification_deliveries
             SET status = ?, last_error = ?
             WHERE candidate_id = ? AND subscription_id = ?`
          ).bind(
            failureStatusAfterAttempt(delivery.attempt_count),
            failureDetail,
            delivery.candidate_id,
            delivery.subscription_id
          )
        ));
        if (isDeadPushSubscription(sub, result)) {
          // notification_deliveries.subscription_id cascades from
          // push_subscriptions, so deleting the subscription here also deletes
          // every delivery row that recorded WHY the send failed. That is how
          // 13 candidates ended up marked "No registered push subscription"
          // with an empty notification_deliveries table and no way to tell that
          // the real cause was a rejected token. Stamp the actual push-service
          // error onto the candidates before the cascade erases it.
          await db.batch(claimed.map((delivery) =>
            db.prepare(
              `UPDATE notification_candidates
               SET last_error = ?
               WHERE id = ?`
            ).bind(
              `${sub.platform} subscription rejected (${result.status}${reason ? ` ${reason}` : ""}) — token removed`.slice(0, 1000),
              delivery.candidate_id
            )
          ));
          await db.prepare("DELETE FROM push_subscriptions WHERE id = ?")
            .bind(sub.id)
            .run();
        }
      }
    }

    if (delivered) {
      await recordActivity(db, {
        userId,
        kind: "new_jobs_sent",
        source: "system",
        jobId: delivered.data.job_ids?.[0] ?? null,
        detail: { count: userCandidates.length, daily: Boolean(digestKey) },
        occurredAt: now,
        dedupeKey: `new_jobs:${notificationId}`,
      }, now);
      await recordSentNotification(db, {
        id: notificationId,
        userId,
        kind: "new_jobs",
        dedupeKey: digestKey ?? `new_jobs:${notificationId}`,
        payload: delivered,
        entityType: "job",
        entityId: delivered.data.job_ids?.[0] ?? null,
        devices: devicesSent,
        sentAt: new Date(),
      });
    } else if (digestKey) {
      await db.prepare(
        "UPDATE notification_log SET status = 'failed', error = 'No device took it' WHERE id = ?"
      ).bind(notificationId).run();
    }

    for (const candidate of userCandidates) {
      const state = await db.prepare(
        `SELECT
           COUNT(*) AS total,
           SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) AS sent_count,
           SUM(CASE WHEN status IN ('pending', 'retry', 'sending') THEN 1 ELSE 0 END) AS active_count
         FROM notification_deliveries
         WHERE candidate_id = ?`
      ).bind(candidate.candidate_id).first<{ total: number; sent_count: number; active_count: number }>();
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
        ).bind(new Date().toISOString(), candidate.candidate_id).run();
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
          total === 0 ? "No registered push subscription" : "Delivery failed on every registered device",
          // A dead subscription cascades its delivery rows away. Keep the
          // push-service rejection stamped above instead of immediately
          // replacing it with the less useful "no subscription" fallback.
          total === 0
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
  error: string,
  preserveExistingError = false
) {
  await db.batch(candidates.map((candidate) =>
    db.prepare(
      `UPDATE notification_candidates
       SET status = ?, last_error = ${preserveExistingError ? "COALESCE(last_error, ?)" : "?"}
       WHERE id = ?`
    ).bind(status, error.slice(0, 1000), candidate.candidate_id)
  ));
}
