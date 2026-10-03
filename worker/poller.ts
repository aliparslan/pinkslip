import type {
  ATSAdapter,
  JobContent,
  JobListing,
  JobReference,
} from "./adapters/types";
import type { Env, CompanyRow } from "./types";
import { getAdapter, getCompanySourceType } from "./ats";
import {
  advanceBacklogMatching,
  matchJobsForAllProfiles,
} from "./user-job-matches";
import {
  JOB_CLASSIFIER_VERSION,
  ensureJobFeatures,
  storedJobFeaturesFromRow,
  upsertJobFeatures,
  type JobFeatures,
  type StoredJobFeatureColumns,
} from "./job-features";
import {
  createNotificationCandidates,
  deliverPendingNotifications,
} from "./notification-delivery";
import {
  ensureEligibleJobs,
  isCurrentJobScopeListing,
  isEligibleJobListing,
  isPotentialCatalogJobListing,
  loadCustomTitles,
} from "./job-scope";
import { isEvergreenPosting } from "../shared/job-policy";
import {
  notifyAdminsOfQuarantinedSources,
  type QuarantinedSource,
} from "./admin-alerts";
import { hasTable } from "./db-schema";
import { sourceDecisionRecorder } from "./classification-shadow";

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
 * Notification matching is jobs × profiles, so process it in bounded batches.
 * Jobs beyond this batch remain in notification_match_backlog for the next
 * cycle instead of being silently excluded from notifications.
 */
export const NOTIFICATION_MATCH_BATCH_SIZE = 150;
/**
 * Commit notification matching progress in smaller units without reducing the
 * per-cycle throughput above. A failed checkpoint is retried next cycle while
 * completed checkpoints stay cleared from the backlog.
 */
export const NOTIFICATION_MATCH_CHECKPOINT_SIZE = 25;
export const NOTIFICATION_CRON_SCHEDULE = "2,17,32,47 * * * *";
const CONTENT_BACKFILL_BATCH_SIZE = 20;

/**
 * Newly enabled detail-poor boards can expose thousands of otherwise eligible
 * rows at once. Bound eager hydration per company so six concurrent company
 * polls cannot consume the Worker's external-subrequest or memory budget in a
 * single invocation. Successful rows become existing jobs, so the next poll
 * naturally advances to the remaining discoveries; failed rows stay eligible
 * for retry without preventing later rows in the same checkpoint from landing.
 */
export const NEW_JOB_HYDRATION_LIMIT_PER_COMPANY = 20;
export const NEW_JOB_HYDRATION_CHECKPOINT_SIZE = 4;
export const FULL_BACKFILL_NEW_JOB_LIMIT = 300;
export const SOURCE_JOB_INSPECTION_POLICY_VERSION = 4;
const POLL_ROTATION_INTERVAL_MS = 15 * 60 * 1000;

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

/**
 * A disabled source is being verified or backfilled. Its open catalog may be
 * genuinely recent at the ATS, but it is not a stream of jobs newly posted
 * since Pinkslip began watching the company. Persist those rows and their
 * features without turning the initial catalog import into a push-notification
 * burst; normal notifications begin only after the source is enabled.
 */
export function shouldQueueNotificationsForCompany(
  company: Pick<CompanyRow, "enabled">
): boolean {
  return company.enabled === 1;
}

/**
 * Decide whether a successful adapter response is safe to use for absence
 * tracking. A schema-valid empty response is not enough evidence that an
 * established board suddenly removed every posting: upstream maintenance and
 * filter regressions can both look exactly like an empty board. Until an
 * adapter can provide a stronger, source-specific completeness signal, keep
 * the existing catalog intact and surface the empty snapshot as a poll error.
 */
export function isTrustworthyJobSnapshot(
  fetchedCount: number,
  openExistingCount: number
): boolean {
  if (fetchedCount === 0) return openExistingCount === 0;
  return openExistingCount < 8
    || fetchedCount >= Math.floor(openExistingCount * 0.5);
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

interface DiscoveredJobCheckpointDependencies<T> {
  hydrate: (discovered: T) => Promise<JobListing>;
  accept: (listing: JobListing) => boolean;
  persist: (listings: JobListing[]) => Promise<NewJobMeta[]>;
  afterCheckpoint?: (
    outcomes: Array<{
      discovered: T;
      result: PromiseSettledResult<JobListing>;
      accepted: boolean;
    }>
  ) => Promise<void>;
}

interface DiscoveredJobCheckpointOptions {
  limit?: number;
  limitCeiling?: number;
  checkpointSize?: number;
  compactReturnMetadata?: boolean;
}

function compactNewJobMeta(job: NewJobMeta): NewJobMeta {
  return {
    ...job,
    listing: {
      ...job.listing,
      // Cron only needs the count and IDs after persistence; notification
      // matching reloads canonical content/features from D1. Dropping the large
      // field here prevents six completed company polls from retaining every
      // description until the slowest source settles.
      description: null,
    },
  };
}

/**
 * Rotate the bounded hydration window using the company's previous poll slot.
 * Rows rejected only after detail inspection (for example a PhD or clearance
 * requirement) remain absent by design, so always taking the first N rows
 * would let them permanently hide valid rows later in a stable source order.
 * The 15-minute poll ordinal advances the window by exactly one cap per normal
 * cycle without persisting filter-policy decisions as permanent job blocks.
 */
export function rotateDiscoveredJobsForPoll<T>(
  discoveredJobs: T[],
  lastPolledAt: string | null,
  windowSize = NEW_JOB_HYDRATION_LIMIT_PER_COMPANY
): T[] {
  if (discoveredJobs.length <= windowSize || windowSize <= 0) {
    return discoveredJobs;
  }

  const lastPollMs = lastPolledAt ? Date.parse(lastPolledAt) : Number.NaN;
  if (!Number.isFinite(lastPollMs)) return discoveredJobs;

  const pollOrdinal = Math.floor(lastPollMs / POLL_ROTATION_INTERVAL_MS);
  const start = (pollOrdinal * windowSize) % discoveredJobs.length;
  if (start === 0) return discoveredJobs;
  return [
    ...discoveredJobs.slice(start),
    ...discoveredJobs.slice(0, start),
  ];
}

export async function processDiscoveredJobCheckpoints<T>(
  discoveredJobs: T[],
  dependencies: DiscoveredJobCheckpointDependencies<T>,
  options: DiscoveredJobCheckpointOptions = {}
): Promise<NewJobMeta[]> {
  const limitCeiling = Math.max(
    0,
    options.limitCeiling ?? NEW_JOB_HYDRATION_LIMIT_PER_COMPANY
  );
  const limit = Math.max(
    0,
    Math.min(
      limitCeiling,
      options.limit ?? NEW_JOB_HYDRATION_LIMIT_PER_COMPANY
    )
  );
  const checkpointSize = Math.max(
    1,
    Math.min(
      NEW_JOB_HYDRATION_CHECKPOINT_SIZE,
      options.checkpointSize ?? NEW_JOB_HYDRATION_CHECKPOINT_SIZE
    )
  );
  const selected = discoveredJobs.slice(0, limit);
  const persisted: NewJobMeta[] = [];

  for (let offset = 0; offset < selected.length; offset += checkpointSize) {
    const checkpoint = selected.slice(offset, offset + checkpointSize);
    const hydration = await runWithConcurrency(
      checkpoint,
      checkpointSize,
      dependencies.hydrate
    );
    const outcomes = checkpoint.map((discovered, index) => {
      const result = hydration[index];
      return {
        discovered,
        result,
        accepted: result.status === "fulfilled"
          && dependencies.accept(result.value),
      };
    });
    const accepted = outcomes.flatMap(({ result, accepted: shouldAccept }) => {
      if (result.status !== "fulfilled" || !shouldAccept) return [];
      return [result.value];
    });
    if (accepted.length > 0) {
      // Persist each checkpoint before hydrating the next one. A later upstream
      // or D1 failure therefore leaves completed jobs, notification backlog rows,
      // and features committed; the next poll retries only what is still absent.
      const checkpointMeta = await dependencies.persist(accepted);
      persisted.push(...(
        options.compactReturnMetadata
          ? checkpointMeta.map(compactNewJobMeta)
          : checkpointMeta
      ));
    }
    // The callback runs only after accepted rows have committed. Reference-only
    // sources use it to remember every successful inspection, including jobs
    // rejected by Pinkslip's audience filters. Failed details remain unresolved
    // and are therefore retried on a later poll.
    await dependencies.afterCheckpoint?.(outcomes);
  }

  return persisted;
}

interface ResolvedJobReferenceRow {
  external_id: string;
  job_url: string;
  inspection_policy_version: number;
}

interface ExistingJobStateRow {
  external_id: string;
  closed_at: string | null;
  missed_polls: number;
}

export function unresolvedJobReferences(
  references: readonly JobReference[],
  resolvedUrls: ReadonlyMap<string, string>,
  existingIds: ReadonlySet<string>,
  blockedIds: ReadonlySet<string>,
  resolvedPolicyVersions?: ReadonlyMap<string, number>
): JobReference[] {
  return references.filter((reference) => {
    if (existingIds.has(reference.externalId) || blockedIds.has(reference.externalId)) {
      return false;
    }
    const inspectedAtCurrentPolicy = resolvedPolicyVersions === undefined
      || (resolvedPolicyVersions.get(reference.externalId) ?? 0)
        >= SOURCE_JOB_INSPECTION_POLICY_VERSION;
    return resolvedUrls.get(reference.externalId) !== reference.url
      || !inspectedAtCurrentPolicy;
  });
}

export async function recordResolvedJobReferences(
  db: D1Database,
  companyId: string,
  references: readonly JobReference[],
  seenAt = new Date().toISOString()
) {
  for (let offset = 0; offset < references.length; offset += 75) {
    await db.batch(references.slice(offset, offset + 75).map((reference) =>
      db.prepare(
        `INSERT INTO source_job_references (
           company_id, external_id, job_url, first_seen_at, last_seen_at,
           inspection_policy_version
         ) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(company_id, external_id) DO UPDATE SET
           job_url = excluded.job_url,
           last_seen_at = excluded.last_seen_at,
           inspection_policy_version = excluded.inspection_policy_version`
      ).bind(
        companyId,
        reference.externalId,
        reference.url,
        seenAt,
        seenAt,
        SOURCE_JOB_INSPECTION_POLICY_VERSION
      )
    ));
  }
}

async function deleteResolvedJobReferences(
  db: D1Database,
  companyId: string,
  externalIds: readonly string[]
) {
  for (let offset = 0; offset < externalIds.length; offset += 75) {
    const ids = externalIds.slice(offset, offset + 75);
    const placeholders = ids.map(() => "?").join(", ");
    await db.prepare(
      `DELETE FROM source_job_references
       WHERE company_id = ? AND external_id IN (${placeholders})`
    ).bind(companyId, ...ids).run();
  }
}

async function reconcileReferenceSnapshot(
  db: D1Database,
  companyId: string,
  existingJobs: readonly ExistingJobStateRow[],
  resolvedReferences: readonly ResolvedJobReferenceRow[],
  currentIds: ReadonlySet<string>,
  now: string
) {
  const statements: D1PreparedStatement[] = [];
  for (const job of existingJobs) {
    if (currentIds.has(job.external_id)) {
      // Do not reopen rows closed by scope cleanup. A complete detail backfill
      // can safely decide whether a closed job has become eligible again.
      if (job.missed_polls !== 0) {
        statements.push(
          db.prepare(
            `UPDATE jobs SET missed_polls = 0
             WHERE company_id = ? AND external_id = ? AND missed_polls != 0`
          ).bind(companyId, job.external_id)
        );
      }
    } else if (job.closed_at === null) {
      statements.push(
        db.prepare(
          `UPDATE jobs
           SET missed_polls = missed_polls + 1,
               closed_at = CASE
                 WHEN missed_polls + 1 >= ? THEN ?
                 ELSE NULL END
           WHERE company_id = ? AND external_id = ? AND closed_at IS NULL`
        ).bind(CLOSE_AFTER_MISSES, now, companyId, job.external_id)
      );
    }
  }
  for (let offset = 0; offset < statements.length; offset += 75) {
    await db.batch(statements.slice(offset, offset + 75));
  }

  // Forget removed references so a later reappearance is inspected again.
  // This is normally a tiny delete set and avoids rewriting the full manifest
  // on every 15-minute poll.
  await deleteResolvedJobReferences(
    db,
    companyId,
    resolvedReferences
      .filter((row) => !currentIds.has(row.external_id))
      .map((row) => row.external_id)
  );
}

function assertUniqueJobReferences(
  adapterName: string,
  references: readonly JobReference[]
) {
  const seen = new Set<string>();
  for (const reference of references) {
    if (seen.has(reference.externalId)) {
      throw new Error(
        `${adapterName} returned duplicate job reference ${reference.externalId}`
      );
    }
    seen.add(reference.externalId);
  }
}

interface PollCompanyOptions {
  compactReturnMetadata?: boolean;
  fullBackfill?: boolean;
  recordDecisions?: (companyId: string, jobs: JobListing[], customTitles: readonly string[]) => Promise<void>;
}

export interface PollingSnapshot {
  jobs: JobListing[];
  /** Only complete snapshots may close jobs that are absent upstream. */
  complete: boolean;
}

export async function fetchPollingSnapshot(
  adapter: ATSAdapter,
  slug: string,
  mode: "discovery" | "complete" = "discovery"
): Promise<PollingSnapshot> {
  if (mode === "discovery" && adapter.fetchDiscoveryJobs) {
    return {
      jobs: await adapter.fetchDiscoveryJobs(slug),
      complete: false,
    };
  }
  return {
    jobs: await adapter.fetchJobs(slug),
    complete: true,
  };
}

export async function pollCompany(
  company: CompanyRow,
  db: D1Database,
  customTitles: readonly string[] = [],
  options: PollCompanyOptions = {}
): Promise<NewJobMeta[]> {
  const adapter = getAdapter(getCompanySourceType(company));

  if (!adapter) return [];

  const supportsReferenceDiscovery = adapter.fetchDiscoveryJobReferences !== undefined
    && adapter.fetchJobListing !== undefined;
  const useReferenceDiscovery = !options.fullBackfill
    && supportsReferenceDiscovery;
  const discoveryReferences = useReferenceDiscovery
    ? await adapter.fetchDiscoveryJobReferences!(company.ats_slug)
    : null;
  const pollingSnapshot = discoveryReferences === null
    ? await fetchPollingSnapshot(
        adapter,
        company.ats_slug,
        options.fullBackfill ? "complete" : "discovery"
      )
    : { jobs: [], complete: false };
  const fetchedSnapshot = pollingSnapshot.jobs;
  await options.recordDecisions?.(company.id, fetchedSnapshot, customTitles);
  // A complete detail backfill proves which manifest rows were inspected. Read
  // the live manifest once more afterward: IDs added during the long crawl stay
  // unresolved and will be picked up immediately by the next normal poll.
  const fullBackfillReferences = options.fullBackfill && supportsReferenceDiscovery
    ? await adapter.fetchDiscoveryJobReferences!(company.ats_slug)
    : null;
  if (discoveryReferences !== null) {
    assertUniqueJobReferences(adapter.name, discoveryReferences);
  }
  if (fullBackfillReferences !== null) {
    assertUniqueJobReferences(adapter.name, fullBackfillReferences);
  }
  const fetched = fetchedSnapshot.filter((job) => isEligibleJobListing(job, customTitles));
  const fetchedExtIds = new Set(fetched.map((j) => j.externalId));
  const reopenableExtIds = new Set(
    fetchedSnapshot
      .filter((job) => isCurrentJobScopeListing(job, customTitles))
      .map((job) => job.externalId)
  );

  const [existing, blocked] = await Promise.all([
    db
      .prepare(
        "SELECT external_id, closed_at, missed_polls FROM jobs WHERE company_id = ?"
      )
      .bind(company.id)
      .all<ExistingJobStateRow>(),
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
  const resolved = discoveryReferences !== null || fullBackfillReferences !== null
    ? await db.prepare(
        `SELECT external_id, job_url, inspection_policy_version
         FROM source_job_references
         WHERE company_id = ?`
      ).bind(company.id).all<ResolvedJobReferenceRow>()
    : { results: [] as ResolvedJobReferenceRow[] };
  const resolvedReferenceRows = resolved.results ?? [];

  const now = new Date().toISOString();
  const persistListings = async (jobs: JobListing[]): Promise<NewJobMeta[]> => {
    const checkpointMeta: NewJobMeta[] = jobs.map((job) => ({
      company: company.name,
      title: job.title,
      jobId: crypto.randomUUID(),
      listing: job,
    }));
    const insertStmts = checkpointMeta.flatMap((job) => {
      const statements = [
        db
        .prepare(
          `INSERT INTO jobs (id, company_id, external_id, title, url, location, department, posted_at, first_seen_at, dismissed, description, salary)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`
        )
        .bind(
          job.jobId,
          company.id,
          job.listing.externalId,
          job.listing.title,
          job.listing.url,
          job.listing.location,
          job.listing.department ?? null,
          job.listing.postedAt ?? null,
          now,
          job.listing.description ?? null,
          job.listing.salary ?? null
        ),
      ];
      if (shouldQueueNotificationsForCompany(company)) {
        statements.push(
          db.prepare(
            `INSERT INTO notification_match_backlog (job_id, queued_at)
             VALUES (?, ?)
             ON CONFLICT(job_id) DO NOTHING`
          ).bind(job.jobId, now)
        );
      }
      return statements;
    });

    // Each job insert and its backlog row commit together. Feature generation
    // follows immediately while this checkpoint's full descriptions are live.
    await db.batch(insertStmts);
    await upsertJobFeatures(
      db,
      checkpointMeta.map((job) => ({ jobId: job.jobId, listing: job.listing }))
    );
    return checkpointMeta;
  };

  if (discoveryReferences !== null) {
    const currentIds = new Set(
      discoveryReferences.map((reference) => reference.externalId)
    );
    if (!isTrustworthyJobSnapshot(
      discoveryReferences.length,
      Math.max(openExistingCount, resolvedReferenceRows.length)
    )) {
      throw new Error(
        `${adapter.name} returned a suspiciously truncated job reference snapshot`
      );
    }

    const resolvedUrls = new Map(
      resolvedReferenceRows.map((row) => [row.external_id, row.job_url])
    );
    const resolvedPolicyVersions = new Map(
      resolvedReferenceRows.map((row) => [
        row.external_id,
        row.inspection_policy_version,
      ])
    );
    // Rows already represented in the catalog or explicit blocklist do not
    // need another detail request, but must be represented in the ledger after
    // a migration or recovery.
    await recordResolvedJobReferences(
      db,
      company.id,
      discoveryReferences.filter((reference) =>
        (existingIds.has(reference.externalId) || blockedIds.has(reference.externalId))
        && (
          resolvedUrls.get(reference.externalId) !== reference.url
          || (resolvedPolicyVersions.get(reference.externalId) ?? 0)
            < SOURCE_JOB_INSPECTION_POLICY_VERSION
        )
      ),
      now
    );

    const discoveredReferences = unresolvedJobReferences(
      discoveryReferences,
      resolvedUrls,
      existingIds,
      blockedIds,
      resolvedPolicyVersions
    );
    const hydrationOrder = rotateDiscoveredJobsForPoll(
      discoveredReferences,
      company.last_polled_at
    );
    const newJobs = await processDiscoveredJobCheckpoints<JobReference>(hydrationOrder, {
      hydrate: async (reference) => {
        const listing = await adapter.fetchJobListing!(
          company.ats_slug,
          reference.externalId,
          reference.url
        );
        if (listing.externalId !== reference.externalId) {
          throw new Error(
            `${adapter.name} detail identity did not match reference ${reference.externalId}`
          );
        }
        return listing;
      },
      accept: (job) => Boolean(
        job.description?.trim()
        && isPotentialCatalogJobListing(job, customTitles)
      ),
      persist: persistListings,
      afterCheckpoint: async (outcomes) => {
        await options.recordDecisions?.(company.id, outcomes.flatMap(({ result }) =>
          result.status === "fulfilled" ? [result.value] : []), customTitles);
        await recordResolvedJobReferences(
          db,
          company.id,
          outcomes.flatMap(({ discovered, result }) =>
            result.status === "fulfilled" ? [discovered] : []
          ),
          now
        );
      },
    }, {
      compactReturnMetadata: options.compactReturnMetadata,
    });

    await reconcileReferenceSnapshot(
      db,
      company.id,
      existingRows,
      resolvedReferenceRows,
      currentIds,
      now
    );
    return newJobs;
  }

  const finalizeFullReferenceSnapshot = async () => {
    if (fullBackfillReferences === null) return;
    if (!isTrustworthyJobSnapshot(
      fullBackfillReferences.length,
      Math.max(fetchedSnapshot.length, resolvedReferenceRows.length)
    )) {
      throw new Error(
        `${adapter.name} returned a suspiciously truncated post-backfill reference snapshot`
      );
    }
    const fetchedSnapshotIds = new Set(
      fetchedSnapshot.map((job) => job.externalId)
    );
    const currentIds = new Set(
      fullBackfillReferences.map((reference) => reference.externalId)
    );
    await recordResolvedJobReferences(
      db,
      company.id,
      fullBackfillReferences.filter((reference) =>
        fetchedSnapshotIds.has(reference.externalId)
      ),
      now
    );
    await deleteResolvedJobReferences(
      db,
      company.id,
      resolvedReferenceRows
        .filter((row) => !currentIds.has(row.external_id))
        .map((row) => row.external_id)
    );
  };

  // Guard against partial/failed ATS responses: if the fetch returned far fewer
  // jobs than we currently have open, treat it as incomplete and do NOT close the
  // missing ones (a partial page would otherwise wipe valid jobs from every
  // feed). Absent jobs are only closed after CLOSE_AFTER_MISSES consecutive
  // misses so one bad page can't nuke the board.
  const responseLooksComplete = pollingSnapshot.complete && isTrustworthyJobSnapshot(
    fetchedSnapshot.length,
    openExistingCount
  );
  if (pollingSnapshot.complete && fetchedSnapshot.length === 0 && openExistingCount > 0) {
    throw new Error(
      `Source returned an empty snapshot while ${openExistingCount} jobs are still open`
    );
  }

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
      if (reopenableExtIds.has(extId)) {
        updateStmts.push(
          db
            .prepare(
              `UPDATE jobs SET missed_polls = 0, closed_at = NULL, evergreen = ?
               WHERE company_id = ? AND external_id = ?
                 AND (missed_polls != 0 OR closed_at IS NOT NULL OR evergreen != ?)`
            )
            .bind(evergreen ? 1 : 0, company.id, extId, evergreen ? 1 : 0)
        );
      } else {
        // Cleanup deliberately closed this title/location. Seeing it on the
        // upstream board again resets absence tracking but must not undo the
        // scope decision that removed it from Pinkslip.
        updateStmts.push(
          db
            .prepare(
              `UPDATE jobs SET missed_polls = 0, evergreen = ?
               WHERE company_id = ? AND external_id = ?
                 AND (missed_polls != 0 OR evergreen != ?)`
            )
            .bind(evergreen ? 1 : 0, company.id, extId, evergreen ? 1 : 0)
        );
      }
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
    (job) => !existingIds.has(job.externalId)
      && !blockedIds.has(job.externalId)
      // A title that is already explicitly senior/staff/management cannot be
      // rescued by description content under Pinkslip's fixed audience rules.
      // Skip both its detail request and its catalog row, while keeping it in
      // fetchedSnapshot above so absence tracking remains authoritative.
      && isPotentialCatalogJobListing(job, customTitles)
  );
  if (
    fullBackfillReferences !== null
    && discoveredJobs.length > FULL_BACKFILL_NEW_JOB_LIMIT
  ) {
    throw new Error(
      `${adapter.name} full backfill found ${discoveredJobs.length} new catalog jobs, exceeding the ${FULL_BACKFILL_NEW_JOB_LIMIT}-job persistence limit`
    );
  }
  if (discoveredJobs.length === 0) {
    await finalizeFullReferenceSnapshot();
    return [];
  }

  // Detail-poor list APIs are enriched before insertion so experience, exact
  // date, and location are available before a role enters any feed. Work in
  // small persisted checkpoints: this bounds both external requests and the
  // descriptions retained in memory while preserving retry-on-later-poll.
  const hydrationOrder = rotateDiscoveredJobsForPoll(
    discoveredJobs,
    company.last_polled_at
  );
  const newJobs = await processDiscoveredJobCheckpoints(hydrationOrder, {
    hydrate: (job) => hydrateListing(adapter, company.ats_slug, job),
    accept: (job) => Boolean(
      job.description?.trim()
      && isPotentialCatalogJobListing(job, customTitles)
    ),
    persist: persistListings,
    afterCheckpoint: async (outcomes) => {
      await options.recordDecisions?.(company.id, outcomes.flatMap(({ result }) =>
        result.status === "fulfilled" ? [result.value] : []), customTitles);
    },
  }, {
    limit: options.fullBackfill
      ? FULL_BACKFILL_NEW_JOB_LIMIT
      : NEW_JOB_HYDRATION_LIMIT_PER_COMPANY,
    limitCeiling: options.fullBackfill
      ? FULL_BACKFILL_NEW_JOB_LIMIT
      : NEW_JOB_HYDRATION_LIMIT_PER_COMPANY,
    compactReturnMetadata: options.compactReturnMetadata,
  });
  await finalizeFullReferenceSnapshot();
  return newJobs;
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

type NullableStoredJobFeatureColumns = {
  [Key in keyof StoredJobFeatureColumns]: StoredJobFeatureColumns[Key] | null;
};

type NotificationBacklogRow = {
  job_id: string;
  external_id: string;
  title: string;
  url: string;
  location: string;
  department: string | null;
  posted_at: string | null;
  description: string | null;
  salary: string | null;
  company_name: string;
} & NullableStoredJobFeatureColumns;

export interface NotificationMatchJob extends NewJobMeta {
  features?: JobFeatures;
}

function hasStoredJobFeatures(
  row: NotificationBacklogRow
): row is NotificationBacklogRow & StoredJobFeatureColumns {
  return row.role_family !== null
    && row.specialties_json !== null
    && row.seniority !== null
    && row.work_mode !== null
    && row.countries_json !== null
    && row.metro_areas_json !== null
    && row.requires_advanced_degree !== null
    && row.requires_security_clearance !== null
    && row.classifier_version === JOB_CLASSIFIER_VERSION
    && row.confidence !== null;
}

export interface NotificationBacklogDependencies {
  load: (db: D1Database, limit: number) => Promise<NotificationMatchJob[]>;
  match: typeof matchJobsForAllProfiles;
  createCandidates: typeof createNotificationCandidates;
  clear: (db: D1Database, jobIds: string[]) => Promise<void>;
}

async function loadNotificationMatchBacklog(
  db: D1Database,
  limit: number
): Promise<NotificationMatchJob[]> {
  // Rows can become ineligible while waiting in the queue. Removing those
  // here prevents a permanently closed or content-less job from blocking the
  // oldest-first batch forever.
  await db.prepare(
    `DELETE FROM notification_match_backlog
     WHERE NOT EXISTS (
       SELECT 1
       FROM jobs j
       WHERE j.id = notification_match_backlog.job_id
         AND j.closed_at IS NULL
         AND j.description IS NOT NULL
         AND trim(j.description) != ''
     )`
  ).run();

  const result = await db.prepare(
    `SELECT nmb.job_id, j.external_id, j.title, j.url, j.location,
            j.department, j.posted_at,
            CASE
              WHEN jf.job_id IS NULL
                OR jf.classifier_version != ?
                OR jf.requires_advanced_degree IS NULL
                OR jf.requires_security_clearance IS NULL
                THEN j.description
              ELSE 'available'
            END AS description,
            j.salary, c.name AS company_name,
            jf.role_family, jf.specialties_json, jf.seniority, jf.min_years,
            jf.max_years, jf.work_mode, jf.countries_json, jf.metro_areas_json,
            jf.salary_min, jf.salary_max, jf.salary_currency, jf.salary_period,
            jf.sponsorship_available, jf.requires_advanced_degree,
            jf.requires_security_clearance, jf.qualification_requirements_json,
            jf.classifier_version, jf.confidence
     FROM notification_match_backlog nmb
     JOIN jobs j ON j.id = nmb.job_id
     JOIN companies c ON c.id = j.company_id
     LEFT JOIN job_features jf ON jf.job_id = j.id
     ORDER BY nmb.queued_at ASC, nmb.job_id ASC
     LIMIT ?`
  ).bind(JOB_CLASSIFIER_VERSION, limit).all<NotificationBacklogRow>();

  return (result.results ?? []).map((row) => ({
    company: row.company_name,
    title: row.title,
    jobId: row.job_id,
    features: hasStoredJobFeatures(row)
      ? storedJobFeaturesFromRow(row)
      : undefined,
    listing: {
      externalId: row.external_id,
      title: row.title,
      url: row.url,
      location: row.location,
      department: row.department,
      postedAt: row.posted_at,
      description: row.description,
      salary: row.salary,
    },
  }));
}

async function clearNotificationMatchBacklog(
  db: D1Database,
  jobIds: string[]
): Promise<void> {
  for (let offset = 0; offset < jobIds.length; offset += 75) {
    const ids = jobIds.slice(offset, offset + 75);
    const placeholders = ids.map(() => "?").join(", ");
    await db.prepare(
      `DELETE FROM notification_match_backlog WHERE job_id IN (${placeholders})`
    ).bind(...ids).run();
  }
}

const notificationBacklogDependencies: NotificationBacklogDependencies = {
  load: loadNotificationMatchBacklog,
  match: matchJobsForAllProfiles,
  createCandidates: createNotificationCandidates,
  clear: clearNotificationMatchBacklog,
};

export async function processNotificationMatchBacklog(
  db: D1Database,
  limit = NOTIFICATION_MATCH_BATCH_SIZE,
  dependencies: NotificationBacklogDependencies = notificationBacklogDependencies
): Promise<number> {
  let processed = 0;
  while (processed < limit) {
    const checkpointLimit = Math.min(
      NOTIFICATION_MATCH_CHECKPOINT_SIZE,
      limit - processed
    );
    const jobs = await dependencies.load(db, checkpointLimit);
    if (jobs.length === 0) break;

    await dependencies.match(
      db,
      jobs.map((job) => ({
        jobId: job.jobId,
        listing: job.listing,
        features: job.features,
      }))
    );
    await dependencies.createCandidates(db, jobs.map((job) => job.jobId));
    // Candidate creation is idempotent. Clear only after it succeeds so a crash
    // retries this checkpoint instead of losing notifications.
    await dependencies.clear(db, jobs.map((job) => job.jobId));
    processed += jobs.length;

    if (jobs.length < checkpointLimit) break;
  }
  return processed;
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

  const queuedAt = new Date().toISOString();
  for (let offset = 0; offset < repaired.length; offset += 35) {
    await db.batch(repaired.slice(offset, offset + 35).flatMap(({ row, listing }) => [
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
      ),
      db.prepare(
        `INSERT INTO notification_match_backlog (job_id, queued_at)
         VALUES (?, ?)
         ON CONFLICT(job_id) DO NOTHING`
      ).bind(row.id, queuedAt),
    ]));
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
    if (!isPotentialCatalogJobListing(listing, customTitles)) return [];
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
    const jobIds = jobs.map((job) => job.jobId);
    await createNotificationCandidates(db, jobIds);
    await clearNotificationMatchBacklog(db, jobIds);
  }
  return deliverPendingNotifications(db, env);
}

/**
 * Notification matching runs in its own scheduled invocation so it receives a
 * fresh Worker memory budget instead of inheriting the polling heap. The
 * two-minute offset from source polling keeps posting-to-alert latency close to
 * the existing cadence while preventing the two workloads from overlapping.
 */
export async function runNotificationCycle(env: Env): Promise<{
  matchesProcessed: number;
  notificationsSent: number;
}> {
  const matchesProcessed = await processNotificationMatchBacklog(env.DB);
  const notificationsSent = await deliverPendingNotifications(env.DB, env);
  return { matchesProcessed, notificationsSent };
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
  // Classifier migrations must progress without depending on an admin opening
  // Inbox. The bounded batch prioritizes internship-like titles, so a career-
  // stage policy change becomes visible promptly while the remaining catalog
  // continues draining over subsequent poll cycles.
  await ensureJobFeatures(db);

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
  const recordDecisions = await sourceDecisionRecorder(db,
    env.JOB_CLASSIFICATION_AUDIT === "true" || env.JOB_CLASSIFICATION_SHADOW === "true",
    env.JOB_CLASSIFICATION_SHADOW === "true");
  const now = new Date().toISOString();

  const results = await runWithConcurrency(
    companies,
    6,
    (company) => pollCompany(company, db, customTitles, {
      compactReturnMetadata: true,
      recordDecisions,
    })
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

  let notificationsSent = 0;
  if (sendNotifications) {
    const notificationMatchesProcessed = await processNotificationMatchBacklog(db);
    if (notificationMatchesProcessed > 0) {
      log.push(`notification matching: ${notificationMatchesProcessed} processed`);
    }
    notificationsSent = await deliverPendingNotifications(db, env);

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
    await advanceBacklogMatching(db).catch((error) => {
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
