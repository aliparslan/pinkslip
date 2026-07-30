import type { ATSAdapter, JobContent, JobListing } from "./adapters/types";
import type { Env, CompanyRow } from "./types";
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
import { ensureEligibleJobs, isEligibleJobListing, loadCustomTitles } from "./job-scope";
import { isEvergreenPosting } from "../shared/job-policy";
import {
  notifyAdminsOfQuarantinedSources,
  type QuarantinedSource,
} from "./admin-alerts";
import { hasTable } from "./db-schema";

const CLOSED_JOB_PURGE_BATCH_SIZE = 100;

/**
 * Long-tail sources polled per cycle.
 *
 * With ~800 tier-2 sources this rotates the whole tail in a little over three
 * hours. That is the right trade for early-stage startups — they post rarely,
 * and their listings are not the ones being raced for — while the marquee
 * boards keep the full 15-minute cadence in tier 1. Raising this shortens the
 * rotation at the cost of per-cycle request budget and runtime, which already
 * sits near 45 seconds.
 */
const TIER_TWO_POLLS_PER_CYCLE = 60;

const MANUAL_TIER_TWO_BATCH = 250;

/**
 * New jobs matched inline per cycle. Matching is jobs × profiles in one
 * invocation, so this is the ceiling that keeps onboarding a large board from
 * reproducing the June cron failure. At 110 profiles this is ~16.5k scoring
 * operations, well inside budget.
 */
const MATCH_INLINE_LIMIT_PER_CYCLE = 150;
const CONTENT_BACKFILL_BATCH_SIZE = 20;

// A job must be absent from this many consecutive (trustworthy) polls before it
// is closed, so a single partial/failed ATS response can't remove valid jobs.
const CLOSE_AFTER_MISSES = 2;

/**
 * Consecutive failures before a source is quarantined. Three keeps a transient
 * upstream blip (a timeout, a 502) from quarantining a healthy company, while
 * catching a genuinely dead slug within ~45 minutes.
 */
export const QUARANTINE_AFTER_FAILURES = 3;

export const QUARANTINE_RETRY_MS = 24 * 60 * 60 * 1000;

/**
 * `quarantined_at` records when the source *first* entered quarantine and is
 * deliberately preserved across subsequent failures — it is the "broken since"
 * timestamp an admin needs, so it must not be overwritten on every retry.
 */
export function nextQuarantineState(
  previousFailureCount: number,
  existingQuarantinedAt: string | null,
  now: string
): { failureCount: number; quarantinedAt: string | null } {
  const failureCount = previousFailureCount + 1;
  return {
    failureCount,
    quarantinedAt: failureCount >= QUARANTINE_AFTER_FAILURES
      ? existingQuarantinedAt ?? now
      : existingQuarantinedAt,
  };
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

export function mergeListingContent(
  listing: JobListing,
  content: JobContent
): JobListing {
  return {
    ...listing,
    description: content.description?.trim() || listing.description,
    salary: content.salary?.trim() || listing.salary,
    location: content.location?.trim() || listing.location,
    postedAt: content.postedAt || listing.postedAt,
  };
}

async function hydrateListing(
  adapter: ATSAdapter,
  slug: string,
  listing: JobListing
): Promise<JobListing> {
  if (listing.description?.trim()) return listing;
  const content = await adapter.fetchJobContent(slug, listing.externalId, listing.url);
  return mergeListingContent(listing, content);
}

export async function pollCompany(
  company: CompanyRow,
  db: D1Database,
  customTitles: readonly string[] = []
): Promise<NewJobMeta[]> {
  const adapter = getAdapter(getCompanySourceType(company));

  if (!adapter) return [];

  const fetchedSnapshot = await adapter.fetchJobs(company.ats_slug);
  const fetched = fetchedSnapshot.filter((job) => isEligibleJobListing(job, customTitles));
  const fetchedExtIds = new Set(fetched.map((j) => j.externalId));

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

  // Guard against partial/failed ATS responses: if the fetch returned far fewer
  // jobs than we currently have open, treat it as incomplete and do NOT close the
  // missing ones (a partial page would otherwise wipe valid jobs from every
  // feed). Absent jobs are only closed after CLOSE_AFTER_MISSES consecutive
  // misses so one bad page can't nuke the board.
  const now = new Date().toISOString();
  const responseLooksComplete =
    fetchedSnapshot.length > 0
    && (openExistingCount < 8 || fetchedSnapshot.length >= Math.floor(openExistingCount * 0.5));

  // The eligibility filter above drops anything past the freshness window, so
  // `fetched` cannot answer "is this still on the board?" for an aged posting.
  // The raw snapshot can, and that is the whole distinction between a standing
  // requisition and a role that was filled and removed.
  const snapshotById = new Map(fetchedSnapshot.map((job) => [job.externalId, job]));

  const updateStmts = [];
  for (const extId of existingIds) {
    const listed = snapshotById.get(extId);
    if (listed) {
      const evergreen = isEvergreenPosting(listed.title, listed.postedAt, true);
      updateStmts.push(
        db
          .prepare(
            `UPDATE jobs SET missed_polls = 0, closed_at = NULL, evergreen = ?
             WHERE company_id = ? AND external_id = ?
               AND (missed_polls != 0 OR closed_at IS NOT NULL OR evergreen != ?)`
          )
          .bind(evergreen ? 1 : 0, company.id, extId, evergreen ? 1 : 0)
      );
    }
    if (fetchedExtIds.has(extId)) {
      // Already handled above; an eligible posting is by definition listed.
    } else if (listed) {
      // Still on the board but outside the freshness window — leave it open and
      // flagged rather than counting a miss against it.
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

  const discoveredJobs = fetched.filter(
    (job) => !existingIds.has(job.externalId) && !blockedIds.has(job.externalId)
  );
  if (discoveredJobs.length === 0) return [];

  // Detail-poor list APIs (notably Workday, Rippling, and SmartRecruiters) are
  // enriched before insertion. That makes experience, exact date, and location
  // available before a role can enter any feed or notification candidate, and
  // it means the detail screen never needs a visible "still loading" interlude.
  const hydration = await runWithConcurrency(
    discoveredJobs,
    6,
    (job) => hydrateListing(adapter, company.ats_slug, job)
  );
  const newJobs = hydration.flatMap((result) => {
    if (result.status !== "fulfilled") return [];
    const job = result.value;
    return job.description?.trim() && isEligibleJobListing(job, customTitles) ? [job] : [];
  });
  if (newJobs.length === 0) return [];

  const newMeta: NewJobMeta[] = [];
  const insertStmts = [];

  for (const job of newJobs) {
    const id = crypto.randomUUID();

    insertStmts.push(
      db
        .prepare(
          `INSERT INTO jobs (id, company_id, external_id, title, url, location, department, posted_at, first_seen_at, dismissed, description, salary)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`
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
          job.description ?? null,
          job.salary ?? null
        )
    );

    newMeta.push({
      company: company.name,
      title: job.title,
      jobId: id,
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

interface MissingContentRow {
  id: string;
  external_id: string;
  title: string;
  url: string;
  location: string;
  department: string | null;
  posted_at: string | null;
  description: string | null;
  salary: string | null;
  company_name: string;
  ats_type: CompanyRow["ats_type"];
  source_type: CompanyRow["source_type"];
  ats_slug: string;
}

/**
 * Repairs listings inserted before eager content hydration existed. Failed
 * detail fetches remain null and are retried on a later cron tick.
 */
async function backfillMissingJobContent(
  db: D1Database,
  customTitles: readonly string[] = [],
  limit = CONTENT_BACKFILL_BATCH_SIZE
): Promise<NewJobMeta[]> {
  const result = await db.prepare(
    `SELECT j.id, j.external_id, j.title, j.url, j.location, j.department,
            j.posted_at, j.description, j.salary, c.name AS company_name,
            c.ats_type, c.source_type, c.ats_slug
     FROM jobs j
     JOIN companies c ON c.id = j.company_id
     WHERE c.enabled = 1
       AND j.closed_at IS NULL
       AND j.description IS NULL
       AND COALESCE(c.source_type, c.ats_type) != 'custom'
       AND (j.posted_at IS NULL OR datetime(j.posted_at) > datetime('now', '-30 days'))
     ORDER BY j.first_seen_at DESC
     LIMIT ?`
  ).bind(limit).all<MissingContentRow>();
  const rows = result.results ?? [];
  if (rows.length === 0) return [];

  const hydrated = await runWithConcurrency(rows, 6, async (row) => {
    const adapter = getAdapter(getCompanySourceType(row));
    if (!adapter) return null;
    const listing: JobListing = {
      externalId: row.external_id,
      title: row.title,
      url: row.url,
      location: row.location,
      department: row.department,
      postedAt: row.posted_at,
      description: row.description,
      salary: row.salary,
    };
    const next = await hydrateListing(adapter, row.ats_slug, listing);
    return next.description?.trim() ? { row, listing: next } : null;
  });
  const repaired = hydrated.flatMap((entry) =>
    entry.status === "fulfilled" && entry.value ? [entry.value] : []
  );
  if (repaired.length === 0) return [];

  for (let offset = 0; offset < repaired.length; offset += 50) {
    await db.batch(repaired.slice(offset, offset + 50).map(({ row, listing }) =>
      db.prepare(
        `UPDATE jobs
         SET description = ?, salary = ?, location = ?, posted_at = ?
         WHERE id = ?`
      ).bind(
        listing.description,
        listing.salary,
        listing.location,
        listing.postedAt,
        row.id
      )
    ));
  }

  await upsertJobFeatures(
    db,
    repaired.map(({ row, listing }) => ({ jobId: row.id, listing }))
  );
  const repairedIds = repaired.map(({ row }) => row.id);
  for (let offset = 0; offset < repairedIds.length; offset += 75) {
    const ids = repairedIds.slice(offset, offset + 75);
    const placeholders = ids.map(() => "?").join(", ");
    await db.prepare(`DELETE FROM user_job_matches WHERE job_id IN (${placeholders})`)
      .bind(...ids)
      .run();
  }

  return repaired.flatMap(({ row, listing }) => {
    if (!isEligibleJobListing(listing, customTitles)) return [];
    return [{
      company: row.company_name,
      title: listing.title,
      jobId: row.id,
      listing,
    }];
  });
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
  const trackRuns = await hasTable(db, "fetch_runs");
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

  // Quarantined sources (see nextQuarantineState) are skipped unless their last
  // attempt is older than the retry window, so a permanently broken slug costs
  // one request a day instead of 96 — but still heals itself if it starts
  // working again, with no manual intervention. `enabled` is untouched, so a
  // quarantined company stays distinct from one deliberately turned off.
  const quarantineRetryBefore = new Date(startedAtMs - QUARANTINE_RETRY_MS).toISOString();
  const companySql = `
    SELECT *
    FROM companies
    WHERE enabled = 1 AND COALESCE(source_type, ats_type) != 'custom'
      AND COALESCE(poll_tier, 1) = ?
      AND (
        quarantined_at IS NULL
        OR last_polled_at IS NULL
        OR last_polled_at < ?
      )
    ORDER BY datetime(COALESCE(last_polled_at, added_at)) ASC, added_at ASC
    ${companyLimit === null ? "" : "LIMIT ?"}
  `;
  const selectTier = async (tier: number, limit: number | null) => {
    const result = limit === null
      ? await db.prepare(companySql.replace("LIMIT ?", "")).bind(tier, quarantineRetryBefore).all<CompanyRow>()
      : await db.prepare(
          companySql.includes("LIMIT ?") ? companySql : `${companySql} LIMIT ?`
        ).bind(tier, quarantineRetryBefore, limit).all<CompanyRow>();
    return result.results ?? [];
  };

  // Tier 1 is polled in full every cycle. Tier 2 rotates: ordering by
  // last_polled_at ascending means a fixed slice per tick walks the whole tail
  // round-robin, so several hundred long-tail sources cost a bounded amount of
  // work per cycle instead of multiplying every tick's request and match load.
  const tierTwoLimit = scope === "manual" && companyLimit === null ? MANUAL_TIER_TWO_BATCH : TIER_TWO_POLLS_PER_CYCLE;
  const companies = companyLimit === null
    ? [...await selectTier(1, null), ...await selectTier(2, tierTwoLimit)]
    : await selectTier(1, companyLimit);

  // Custom titles are loaded once and shared across every company in the cycle
  // so a globally unrecognized title can still enter the catalog.
  const customTitles = await loadCustomTitles(db);
  const now = new Date().toISOString();

  const results = await runWithConcurrency(
    companies,
    6,
    (company) => pollCompany(company, db, customTitles)
  );

  const allNewJobs: NewJobMeta[] = [];
  const statusStmts = [];
  // Sources that crossed into quarantine on *this* cycle. Alerting only on the
  // transition is self-deduplicating: a source quarantines once, so admins get
  // one message per breakage rather than one every 15 minutes forever.
  const newlyQuarantined: QuarantinedSource[] = [];
  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    const company = companies[i];
    if (result.status === "fulfilled") {
      allNewJobs.push(...result.value);
      log.push(`${company.name}: ${result.value.length} new`);
      // A success clears the failure streak and releases quarantine, so a slug
      // that starts working again returns to the normal 15-minute cadence.
      statusStmts.push(
        db.prepare(
          `UPDATE companies
           SET last_poll_status = 'ok', last_poll_error = NULL, last_polled_at = ?,
               poll_failure_count = 0, quarantined_at = NULL
           WHERE id = ?`
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
      const quarantine = nextQuarantineState(
        company.poll_failure_count ?? 0,
        company.quarantined_at ?? null,
        now
      );
      if (quarantine.quarantinedAt && !company.quarantined_at) {
        newlyQuarantined.push({ name: company.name, error: errMsg });
      }
      log.push(
        `${company.name}: ERROR ${errMsg}`
        + (quarantine.quarantinedAt && !company.quarantined_at ? " (quarantined)" : "")
      );
      statusStmts.push(
        db.prepare(
          `UPDATE companies
           SET last_poll_status = 'error', last_poll_error = ?, last_polled_at = ?,
               poll_failure_count = ?, quarantined_at = ?
           WHERE id = ?`
        ).bind(errMsg, now, quarantine.failureCount, quarantine.quarantinedAt, company.id)
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

  const repairedJobs = scope === "cron"
    ? await backfillMissingJobContent(db, customTitles).catch((error) => {
        log.push(`content backfill error: ${error instanceof Error ? error.message : String(error)}`);
        return [] as NewJobMeta[];
      })
    : [];
  if (repairedJobs.length > 0) {
    log.push(`content backfill: ${repairedJobs.length} repaired`);
  }
  const discovered = [...allNewJobs, ...repairedJobs];

  // Cap how many newly-discovered jobs are matched inline. Matching fans out
  // across every profile, so the work is jobs × profiles in a single
  // invocation — the exact shape that exhausted D1's CPU budget and killed the
  // cron every 15 minutes through June. A steady-state cycle discovers a
  // handful of jobs and never reaches this cap; it only binds when a large new
  // board is onboarded, and on that cycle nobody wants hundreds of pushes
  // anyway. The remainder is not lost: features are already stored, and the
  // per-user warm-up plus advanceBacklogScoring pick them up on later ticks.
  const matchableJobs = discovered.slice(0, MATCH_INLINE_LIMIT_PER_CYCLE);
  if (discovered.length > matchableJobs.length) {
    log.push(
      `deferred matching for ${discovered.length - matchableJobs.length} of ${discovered.length} new jobs`
    );
  }

  await matchJobsForAllProfiles(
    db,
    matchableJobs.map((job) => ({ jobId: job.jobId, listing: job.listing }))
  );

  let notificationsSent = 0;
  if (sendNotifications) {
    notificationsSent = await sendNotificationsForJobs(db, env, matchableJobs);

    // Wrapped so an alerting failure can never take down the poll cycle it is
    // reporting on.
    if (newlyQuarantined.length > 0) {
      await (async () => {
        const total = await db.prepare(
          "SELECT COUNT(*) AS count FROM companies WHERE quarantined_at IS NOT NULL"
        ).first<{ count: number }>();
        const alerted = await notifyAdminsOfQuarantinedSources(
          db,
          env,
          newlyQuarantined,
          total?.count ?? newlyQuarantined.length
        );
        log.push(`quarantine alert: ${newlyQuarantined.length} new, ${alerted} admin device(s) notified`);
      })().catch((error) => {
        log.push(`quarantine alert failed: ${error instanceof Error ? error.message : String(error)}`);
      });
    }
  }

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
