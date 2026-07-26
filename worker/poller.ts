import type { JobListing } from "./adapters/types";
import { scoreJob } from "./scoring";
import type { ScoringPrefs } from "./scoring";
import type { Env, CompanyRow, PreferenceRow } from "./types";
import { getAdapter, getCompanySourceType } from "./ats";
import {
  advanceBacklogScoring,
  matchJobsForAllProfiles,
} from "./user-job-scores";
import { upsertJobFeatures } from "./job-features";
import {
  createNotificationCandidates,
  deliverPendingNotifications,
} from "./notification-delivery";
import { ensureEligibleJobs, isEligibleJobListing } from "./job-scope";

const CLOSED_JOB_PURGE_BATCH_SIZE = 100;

// A job must be absent from this many consecutive (trustworthy) polls before it
// is closed, so a single partial/failed ATS response can't remove valid jobs.
const CLOSE_AFTER_MISSES = 2;

// ─── Types ───────────────────────────────────────────────────────────────────

interface PollerPrefs extends ScoringPrefs {
  notify_threshold?: number;
}

interface PollStats {
  companiesPolled: number;
  newJobsFound: number;
  notificationsSent: number;
  log: string[];
}

export interface NewJobMeta {
  company: string;
  title: string;
  jobId: string;
  score: number;
  listing: JobListing;
}

interface CompanyPollError {
  companyId: string;
  companyName: string;
  error: string;
}

interface RunPollCycleOptions {
  limit?: number | null;
  scope?: "cron" | "manual";
  sendNotifications?: boolean;
}

async function hasFetchRunsTable(db: D1Database): Promise<boolean> {
  try {
    const row = await db.prepare(
      `SELECT name
       FROM sqlite_master
       WHERE type = 'table' AND name = 'fetch_runs'
       LIMIT 1`
    ).first<{ name: string }>();

    return Boolean(row?.name);
  } catch {
    return false;
  }
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

export async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let cursor = 0;

  async function runNext(): Promise<void> {
    const index = cursor++;
    if (index >= items.length) return;

    try {
      results[index] = {
        status: "fulfilled",
        value: await worker(items[index], index),
      };
    } catch (error) {
      results[index] = {
        status: "rejected",
        reason: error,
      };
    }

    await runNext();
  }

  const width = Math.max(1, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: width }, () => runNext()));
  return results;
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
    notify_threshold: (map["notify_threshold"] as number) ?? (map["notification_threshold"] as number) ?? 50,
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
  const adapter = getAdapter(getCompanySourceType(company));

  if (!adapter) return [];

  // 2. Fetch jobs from ATS
  const fetchedSnapshot = await adapter.fetchJobs(company.ats_slug);
  const fetched = fetchedSnapshot.filter(isEligibleJobListing);
  const fetchedExtIds = new Set(fetched.map((j) => j.externalId));

  // 3. Load existing (with open/closed state) + blocked external_ids for this company
  const [existing, blocked] = await Promise.all([
    db
      .prepare("SELECT external_id, closed_at FROM jobs WHERE company_id = ?")
      .bind(company.id)
      .all<{ external_id: string; closed_at: string | null }>(),
    db
      .prepare("SELECT external_id FROM blocked_jobs WHERE company_id = ?")
      .bind(company.id)
      .all<{ external_id: string }>(),
  ]);

  const existingRows = existing.results ?? [];
  const existingIds = new Set<string>(existingRows.map((r) => r.external_id));
  const openExistingCount = existingRows.filter((r) => r.closed_at === null).length;
  const blockedIds = new Set<string>(
    (blocked.results ?? []).map((r) => r.external_id)
  );

  // 4. Reconcile open/closed state. Guard against partial/failed ATS responses:
  //    if the fetch returned far fewer jobs than we currently have open, treat it
  //    as incomplete and do NOT close the missing ones (a partial page would
  //    otherwise wipe valid jobs from every feed). Returned jobs are always
  //    reopened + reset; absent jobs are only closed after CLOSE_AFTER_MISSES
  //    consecutive misses so one bad page can't nuke the board.
  const now = new Date().toISOString();
  const responseLooksComplete =
    fetchedSnapshot.length > 0
    && (openExistingCount < 8 || fetchedSnapshot.length >= Math.floor(openExistingCount * 0.5));

  const updateStmts = [];
  for (const extId of existingIds) {
    if (fetchedExtIds.has(extId)) {
      updateStmts.push(
        db
          .prepare(
            `UPDATE jobs SET missed_polls = 0, closed_at = NULL
             WHERE company_id = ? AND external_id = ? AND (missed_polls != 0 OR closed_at IS NOT NULL)`
          )
          .bind(company.id, extId)
      );
    } else if (responseLooksComplete) {
      updateStmts.push(
        db
          .prepare(
            `UPDATE jobs
             SET missed_polls = missed_polls + 1,
                 closed_at = CASE
                   WHEN closed_at IS NULL AND missed_polls + 1 >= ? THEN ?
                   ELSE closed_at END
             WHERE company_id = ? AND external_id = ?`
          )
          .bind(CLOSE_AFTER_MISSES, now, company.id, extId)
      );
    }
    // Suspect (partial) response → leave absent jobs untouched this cycle.
  }
  if (updateStmts.length > 0) {
    await db.batch(updateStmts);
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
      listing: job,
    });
  }

  if (insertStmts.length > 0) {
    await db.batch(insertStmts);
    await upsertJobFeatures(
      db,
      newMeta.map((job) => ({ jobId: job.jobId, listing: job.listing }))
    );
  }

  return newMeta;
}

export async function sendNotificationsForJobs(
  db: D1Database,
  env: Env,
  jobs: NewJobMeta[]
): Promise<number> {
  if (jobs.length > 0) {
    await createNotificationCandidates(db, jobs.map((job) => job.jobId));
  }
  return deliverPendingNotifications(db, env);
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
export async function runPollCycle(
  env: Env,
  options: RunPollCycleOptions = {}
): Promise<PollStats> {
  const db = env.DB;
  const scope = options.scope ?? "cron";
  const sendNotifications = options.sendNotifications ?? true;
  const companyLimit =
    options.limit === undefined || options.limit === null
      ? null
      : Math.max(1, options.limit);
  const runId = crypto.randomUUID();
  const startedAt = new Date().toISOString();
  const startedAtMs = Date.now();
  const pollErrors: CompanyPollError[] = [];
  const log: string[] = [];
  const trackRuns = await hasFetchRunsTable(db);
  await ensureEligibleJobs(db);

  if (trackRuns) {
    // Reap runs that never reached the completion UPDATE. A cron tick that is
    // killed mid-cycle (D1 CPU reset, isolate eviction) leaves its row stuck at
    // 'running' forever; 5,949 such rows had accumulated before this existed,
    // hiding the fact that no run had finished since 2026-06-17. Anything still
    // 'running' when the next 15-minute tick begins is dead. Use a 14-minute
    // cutoff so normal scheduler jitter does not leave the previous run 20ms on
    // the wrong side of an exact 15-minute comparison for another full cycle.
    await db.prepare(
      `UPDATE fetch_runs
       SET status = 'error',
           errors_json = COALESCE(errors_json, ?),
           finished_at = ?
       WHERE status = 'running' AND started_at < ?`
    ).bind(
      JSON.stringify([{ error: "Run did not complete — worker terminated before finishing" }]),
      startedAt,
      new Date(startedAtMs - 14 * 60 * 1000).toISOString()
    ).run().catch(() => undefined);

    await db.prepare(
      `INSERT INTO fetch_runs (id, scope, status, started_at)
       VALUES (?, ?, 'running', ?)`
    ).bind(runId, scope, startedAt).run();
  }

  // 1. Load enabled non-custom companies
  const companySql = `
    SELECT *
    FROM companies
    WHERE enabled = 1 AND COALESCE(source_type, ats_type) != 'custom'
    ORDER BY datetime(COALESCE(last_polled_at, added_at)) ASC, added_at ASC
    ${companyLimit === null ? "" : "LIMIT ?"}
  `;
  const companyStmt = db.prepare(companySql);
  const companiesResult = companyLimit === null
    ? await companyStmt.all<CompanyRow>()
    : await companyStmt.bind(companyLimit).all<CompanyRow>();
  const companies = companiesResult.results ?? [];

  // 2. Load preferences
  const prefs = await loadPreferencesForPoll(db);
  const now = new Date().toISOString();

  // 3. Fan out pollCompany() calls
  const results = await runWithConcurrency(
    companies,
    6,
    (company) => pollCompany(company, db, prefs)
  );

  // 4. Collect all new jobs and batch-update poll status per company
  const allNewJobs: NewJobMeta[] = [];
  const statusStmts = [];
  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    const company = companies[i];
    if (result.status === "fulfilled") {
      allNewJobs.push(...result.value);
      log.push(`${company.name}: ${result.value.length} new`);
      statusStmts.push(
        db.prepare(
          "UPDATE companies SET last_poll_status = 'ok', last_poll_error = NULL, last_polled_at = ? WHERE id = ?"
        ).bind(now, company.id)
      );
    } else {
      const errMsg =
        result.reason instanceof Error
          ? result.reason.message
          : String(result.reason);
      pollErrors.push({
        companyId: company.id,
        companyName: company.name,
        error: errMsg,
      });
      log.push(`${company.name}: ERROR ${errMsg}`);
      statusStmts.push(
        db.prepare(
          "UPDATE companies SET last_poll_status = 'error', last_poll_error = ?, last_polled_at = ? WHERE id = ?"
        ).bind(errMsg, now, company.id)
      );
    }
  }
  if (statusStmts.length > 0) {
    await db.batch(statusStmts);
  }
  // Only report the cycle as fresh after every selected company has settled.
  // If the Worker times out mid-poll, the previous timestamp remains visible.
  await db.prepare(
    `INSERT INTO preferences (key, value) VALUES ('last_polled_at', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).bind(new Date().toISOString()).run();

  await matchJobsForAllProfiles(
    db,
    allNewJobs.map((job) => ({ jobId: job.jobId, listing: job.listing }))
  );

  // 5. Send push notifications
  let notificationsSent = 0;
  if (sendNotifications) {
    notificationsSent = await sendNotificationsForJobs(db, env, allNewJobs);
  }

  // 5b. Incrementally score older jobs for a few active users so backlog matches
  //     surface in the feed over time (notifications above only cover new jobs).
  if (scope === "cron") {
    await advanceBacklogScoring(db).catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      console.error("Backlog scoring failed:", message);
      log.push(`backlog scoring error: ${message}`);
    });
  }

  // Purge jobs closed for over 7 days, but preserve any a user still has a stake
  // in — applied OR saved — so saved roles don't silently vanish from their list.
  // closed_at is written with toISOString(), so compare against a bound ISO
  // cutoff rather than datetime('now', …). datetime() on the column defeated any
  // index and forced a full scan of every job row on every cycle; the SQLite
  // 'now' form also renders as "YYYY-MM-DD HH:MM:SS", which does NOT compare
  // correctly against ISO-8601 strings, so both sides have to move together.
  // NOT EXISTS also replaces NOT IN: a single NULL job_id in the subquery would
  // make NOT IN match nothing at all and silently disable the purge entirely.
  // Delete incrementally. Production accumulated 13,447 eligible rows while
  // this maintenance step was broken; trying to cascade all of them in one D1
  // statement reset the database even after the date predicate was indexed.
  // At 100 per 15-minute tick that backlog drains in under a day and a half,
  // while steady-state purges remain tiny.
  await db.prepare(
    `DELETE FROM jobs
     WHERE id IN (
       SELECT j.id
       FROM jobs j
       WHERE j.closed_at IS NOT NULL
         AND j.closed_at < ?
         AND NOT EXISTS (SELECT 1 FROM applications a WHERE a.job_id = j.id)
         AND NOT EXISTS (SELECT 1 FROM saved_jobs s WHERE s.job_id = j.id)
       ORDER BY j.closed_at ASC
       LIMIT ?
     )`
  ).bind(
    new Date(startedAtMs - 7 * 24 * 60 * 60 * 1000).toISOString(),
    CLOSED_JOB_PURGE_BATCH_SIZE
  ).run();
  await Promise.all([
    db.prepare(
      "DELETE FROM email_login_tokens WHERE datetime(expires_at) < datetime('now', '-7 days')"
    ).run(),
    db.prepare(
      "DELETE FROM access_attempts WHERE datetime(attempted_at) < datetime('now', '-1 day')"
    ).run().catch(() => undefined),
    db.prepare(
      "DELETE FROM tailor_usage WHERE datetime(created_at) < datetime('now', '-30 days')"
    ).run().catch(() => undefined),
  ]);
  await db.batch([
    db.prepare(
      "DELETE FROM product_events WHERE datetime(occurred_at) < datetime('now', '-180 days')"
    ),
    db.prepare(
      `DELETE FROM notification_candidates
       WHERE status IN ('sent', 'failed', 'skipped')
         AND datetime(created_at) < datetime('now', '-180 days')`
    ),
  ]);

  if (trackRuns) {
    await db.prepare(
      `UPDATE fetch_runs
       SET status = ?,
           companies_attempted = ?,
           companies_succeeded = ?,
           companies_failed = ?,
           new_jobs_found = ?,
           notifications_sent = ?,
           errors_json = ?,
           finished_at = ?,
           duration_ms = ?
       WHERE id = ?`
    ).bind(
      pollErrors.length > 0 ? "error" : "ok",
      companies.length,
      companies.length - pollErrors.length,
      pollErrors.length,
      allNewJobs.length,
      notificationsSent,
      pollErrors.length > 0 ? JSON.stringify(pollErrors) : null,
      new Date().toISOString(),
      Date.now() - startedAtMs,
      runId
    ).run();
  }

  return {
    companiesPolled: companies.length,
    newJobsFound: allNewJobs.length,
    notificationsSent,
    log,
  };
}
