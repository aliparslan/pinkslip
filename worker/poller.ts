import { GreenhouseAdapter } from "./adapters/greenhouse";
import { LeverAdapter } from "./adapters/lever";
import { AshbyAdapter } from "./adapters/ashby";
import type { JobListing } from "./adapters/types";
import { scoreJob } from "./scoring";
import type { ScoringPrefs, ScoreBreakdown } from "./scoring";
import {
  buildNotificationPayload,
  sendPushNotification,
} from "./push";
import type { NotificationJob } from "./push";
import type { Env, CompanyRow, PreferenceRow, PushSubscriptionRow } from "./types";

// ─── Types ───────────────────────────────────────────────────────────────────

interface PollerPrefs extends ScoringPrefs {
  notify_threshold?: number;
}

interface PollStats {
  companiesPolled: number;
  newJobsFound: number;
  notificationsSent: number;
}

interface NewJobMeta {
  company: string;
  title: string;
  jobId: string;
  score: number;
}

// ─── Pure helpers ────────────────────────────────────────────────────────────

/**
 * Returns only jobs whose externalId is not already in existingExternalIds.
 * Pure function — no side effects, fully unit-testable.
 */
export function diffJobs(
  fetched: JobListing[],
  existingExternalIds: Set<string>
): JobListing[] {
  return fetched.filter((job) => !existingExternalIds.has(job.externalId));
}

// ─── DB helpers ──────────────────────────────────────────────────────────────

/**
 * Reads all rows from the preferences table and parses JSON values.
 * Returns a merged ScoringPrefs + notify_threshold object.
 * Also exported as loadPreferencesForPoll for use in manual poll endpoint.
 */
export async function loadPreferencesForPoll(db: D1Database): Promise<PollerPrefs> {
  const result = await db
    .prepare("SELECT key, value FROM preferences")
    .all<PreferenceRow>();

  const rows = result.results ?? [];

  // Build a key→value map, parsing JSON for array/number values.
  const map: Record<string, unknown> = {};
  for (const row of rows) {
    try {
      map[row.key] = JSON.parse(row.value);
    } catch {
      map[row.key] = row.value;
    }
  }

  return {
    locations: (map["locations"] as string[]) ?? [],
    min_yoe: (map["min_yoe"] as number) ?? 0,
    max_yoe: (map["max_yoe"] as number) ?? 3,
    role_keywords: (map["role_keywords"] as string[]) ?? [],
    negative_keywords: (map["negative_keywords"] as string[]) ?? [],
    notify_threshold: (map["notify_threshold"] as number) ?? 50,
  };
}

// ─── pollCompany ─────────────────────────────────────────────────────────────

/**
 * Polls a single company, diffs against existing jobs, scores, and inserts
 * new jobs into D1. Returns metadata for all newly inserted jobs.
 */
export async function pollCompany(
  company: CompanyRow,
  db: D1Database,
  prefs: ScoringPrefs
): Promise<NewJobMeta[]> {
  // 1. Pick adapter by ats_type
  const adapter = (() => {
    switch (company.ats_type) {
      case "greenhouse":
        return new GreenhouseAdapter();
      case "lever":
        return new LeverAdapter();
      case "ashby":
        return new AshbyAdapter();
      default:
        return null;
    }
  })();

  if (!adapter) return [];

  // 2. Fetch jobs from ATS
  const fetched = await adapter.fetchJobs(company.ats_slug);
  const fetchedExtIds = new Set(fetched.map((j) => j.externalId));

  // 3. Load existing + blocked external_ids for this company
  const [existing, blocked] = await Promise.all([
    db
      .prepare("SELECT external_id FROM jobs WHERE company_id = ?")
      .bind(company.id)
      .all<{ external_id: string }>(),
    db
      .prepare("SELECT external_id FROM blocked_jobs WHERE company_id = ?")
      .bind(company.id)
      .all<{ external_id: string }>(),
  ]);

  const existingIds = new Set<string>(
    (existing.results ?? []).map((r) => r.external_id)
  );
  const blockedIds = new Set<string>(
    (blocked.results ?? []).map((r) => r.external_id)
  );

  // 4. Mark closed jobs (in DB but no longer on ATS) and reopen returned ones
  const now = new Date().toISOString();
  if (fetched.length > 0) {
    const closeStmts = [];
    const reopenStmts = [];
    for (const extId of existingIds) {
      if (!fetchedExtIds.has(extId)) {
        closeStmts.push(
          db
            .prepare(
              "UPDATE jobs SET closed_at = ? WHERE company_id = ? AND external_id = ? AND closed_at IS NULL"
            )
            .bind(now, company.id, extId)
        );
      } else {
        reopenStmts.push(
          db
            .prepare(
              "UPDATE jobs SET closed_at = NULL WHERE company_id = ? AND external_id = ? AND closed_at IS NOT NULL"
            )
            .bind(company.id, extId)
        );
      }
    }
    const allUpdateStmts = [...closeStmts, ...reopenStmts];
    if (allUpdateStmts.length > 0) {
      await db.batch(allUpdateStmts);
    }
  }

  // 5. Diff: new = fetched but not in existing and not blocked
  const newJobs = fetched.filter(
    (job) => !existingIds.has(job.externalId) && !blockedIds.has(job.externalId)
  );
  if (newJobs.length === 0) return [];

  // 6. Score and batch-insert new jobs
  const newMeta: NewJobMeta[] = [];
  const insertStmts = [];

  for (const job of newJobs) {
    const breakdown = scoreJob(job, prefs);
    const id = crypto.randomUUID();

    insertStmts.push(
      db
        .prepare(
          `INSERT INTO jobs (id, company_id, external_id, title, url, location, department, posted_at, first_seen_at, score, title_score, yoe_score, location_score, department_score, recency_score, dismissed, description, salary)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`
        )
        .bind(
          id,
          company.id,
          job.externalId,
          job.title,
          job.url,
          job.location,
          job.department ?? null,
          job.postedAt ?? null,
          now,
          breakdown.score,
          breakdown.title_score,
          breakdown.yoe_score,
          breakdown.location_score,
          breakdown.department_score,
          breakdown.recency_score,
          job.description ?? null,
          job.salary ?? null
        )
    );

    newMeta.push({
      company: company.name,
      title: job.title,
      jobId: id,
      score: breakdown.score,
    });
  }

  if (insertStmts.length > 0) {
    await db.batch(insertStmts);
  }

  return newMeta;
}

// ─── runPollCycle ─────────────────────────────────────────────────────────────

/**
 * Main cron handler. Orchestrates the full polling cycle:
 * 1. Load enabled non-custom companies
 * 2. Load preferences
 * 3. Fan out pollCompany() via Promise.allSettled
 * 4. Collect new jobs
 * 5. Filter by score threshold
 * 6. Send push notifications
 * 7. Return stats
 */
export async function runPollCycle(env: Env): Promise<PollStats> {
  const db = env.DB;

  // 1. Load enabled non-custom companies
  const companiesResult = await db
    .prepare(
      "SELECT * FROM companies WHERE enabled = 1 AND ats_type != 'custom'"
    )
    .all<CompanyRow>();
  const companies = companiesResult.results ?? [];

  // 2. Load preferences
  const prefs = await loadPreferencesForPoll(db);
  const threshold = prefs.notify_threshold ?? 50;

  // 3. Fan out pollCompany() calls
  const results = await Promise.allSettled(
    companies.map((company) => pollCompany(company, db, prefs))
  );

  // 4. Collect all new jobs and update poll status per company
  const allNewJobs: NewJobMeta[] = [];
  const now = new Date().toISOString();
  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    const company = companies[i];
    if (result.status === "fulfilled") {
      allNewJobs.push(...result.value);
      await db
        .prepare(
          "UPDATE companies SET last_poll_status = 'ok', last_poll_error = NULL, last_polled_at = ? WHERE id = ?"
        )
        .bind(now, company.id)
        .run();
    } else {
      const errMsg =
        result.reason instanceof Error
          ? result.reason.message
          : String(result.reason);
      await db
        .prepare(
          "UPDATE companies SET last_poll_status = 'error', last_poll_error = ?, last_polled_at = ? WHERE id = ?"
        )
        .bind(errMsg, now, company.id)
        .run();
    }
  }

  // 5. Filter qualifying jobs
  const qualifying = allNewJobs.filter((j) => j.score >= threshold);

  // 6. Send push notifications
  let notificationsSent = 0;
  if (qualifying.length > 0) {
    // Load all push subscriptions
    const subsResult = await db
      .prepare("SELECT * FROM push_subscriptions")
      .all<PushSubscriptionRow>();
    const subscriptions = subsResult.results ?? [];

    if (subscriptions.length > 0) {
      const notifJobs: NotificationJob[] = qualifying.map((j) => ({
        company: j.company,
        title: j.title,
        jobId: j.jobId,
      }));
      const payload = buildNotificationPayload(notifJobs);

      const vapid = {
        subject: env.VAPID_SUBJECT,
        publicKey: env.VAPID_PUBLIC_KEY,
        privateKey: env.VAPID_PRIVATE_KEY,
      };

      const sendResults = await Promise.allSettled(
        subscriptions.map((sub) =>
          sendPushNotification(
            {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh, auth: sub.auth },
            },
            payload,
            vapid
          )
        )
      );

      for (let i = 0; i < sendResults.length; i++) {
        const r = sendResults[i];
        if (r.status === "fulfilled") {
          if (r.value.ok) {
            notificationsSent++;
          } else if (r.value.status === 410 || r.value.status === 404) {
            await db.prepare("DELETE FROM push_subscriptions WHERE endpoint = ?")
              .bind(subscriptions[i].endpoint).run();
          }
        }
      }
    }
  }

  // Purge jobs closed for over 7 days (but preserve applied jobs)
  await db.prepare(
    `DELETE FROM jobs WHERE closed_at IS NOT NULL AND closed_at < datetime('now', '-7 days')
     AND id NOT IN (SELECT job_id FROM applications WHERE job_id IS NOT NULL)`
  ).run();

  await db.prepare(
    `INSERT INTO preferences (key, value) VALUES ('last_polled_at', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).bind(new Date().toISOString()).run();

  return {
    companiesPolled: companies.length,
    newJobsFound: allNewJobs.length,
    notificationsSent,
  };
}
