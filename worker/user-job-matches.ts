import {
  effectiveTargetStages,
  profileRoleKeywords,
  profileExperienceCeiling,
  specificRoleSpecialties,
  type SearchProfile,
} from "../shared/search-profile";
import type { JobListing } from "./adapters/types";
import {
  classifyJob,
  catalogCareerStage,
  ensureJobFeatures,
  ensureJobFeaturesForIds,
  JOB_CLASSIFIER_VERSION,
  rowToListing,
  storedJobFeaturesFromRow,
  type FeatureJobRow,
  type JobFeatures,
  type StoredJobFeatureColumns,
} from "./job-features";
import {
  loadUserPreferenceState,
  searchProfileFromRow,
  type SearchProfileRow,
} from "./user-preferences";
import { isFreshPostedAt, MAX_POSTED_AGE_DAYS } from "../shared/job-policy";
import { isUsJobLocation } from "./us-jobs";
import { qualificationsEligible, qualificationYearsForProfile } from "./qualification-requirements";

// Bump whenever binary eligibility semantics change so cached matches rebuild.
export const MATCHER_VERSION = "profile-v18-five-years-doctoral";
const MATCH_WARM_BATCH_SIZE = 750;

export interface UserJobMatch {
  jobId: string;
  plausible: boolean;
  requiredYears?: number | null;
}

type MatchableJobRow = FeatureJobRow & StoredJobFeatureColumns & { evergreen: number | null };

interface FeatureCompleteness {
  classifier_version: string | null;
  requires_advanced_degree: number | null;
  requires_security_clearance: number | null;
}

interface CandidateFeatureState extends FeatureCompleteness {
  id: string;
}

function hasCurrentStoredJobFeatures(row: FeatureCompleteness): boolean {
  return row.classifier_version === JOB_CLASSIFIER_VERSION
    && row.requires_advanced_degree !== null
    && row.requires_security_clearance !== null;
}

async function ensureCurrentCandidateFeatures(
  db: D1Database,
  candidates: CandidateFeatureState[]
) {
  const staleIds = candidates
    .filter((candidate) => !hasCurrentStoredJobFeatures(candidate))
    .map((candidate) => candidate.id);
  await ensureJobFeaturesForIds(db, staleIds);
}

export function isLocationEligibleForProfile(
  listing: JobListing,
  features: JobFeatures,
  profile: SearchProfile
): boolean {
  if (
    features.work_mode !== "unknown"
    && !profile.work_modes.includes(features.work_mode)
  ) return false;

  // Remote is country-wide. Ingestion already established US eligibility, and
  // the product intentionally treats an unqualified "Remote" label as US-safe.
  if (features.work_mode === "remote") return true;
  if (profile.relocation_willing) return true;

  const hasLocationPreference = profile.location_ids.length > 0
    || profile.custom_locations.length > 0;
  if (!hasLocationPreference) return true;

  if (features.metro_areas.some((metro) => profile.location_ids.includes(metro))) {
    return true;
  }

  const location = listing.location.toLowerCase();
  return profile.custom_locations.some((preferred) => {
    const normalized = preferred.trim().toLowerCase();
    return normalized.length >= 3
      && (location.includes(normalized) || normalized.includes(location));
  });
}

export function evaluateJobForProfile(
  jobId: string,
  listing: JobListing,
  features: JobFeatures,
  profile: SearchProfile,
  /**
   * Standing pipeline requisitions are deliberately exempt from the freshness
   * gate. They never close, so judging them by posted date would disqualify
   * every one of them and the feed's evergreen filter would always be empty.
   */
  evergreen = false
): UserJobMatch {
  const selectedSpecialty = specificRoleSpecialties(features.specialties)
    .some((specialty) => profile.roles.includes(specialty));
  const customTitle = profile.custom_titles.some((title) => listing.title.toLowerCase().includes(title.toLowerCase()));
  const normalizedTitle = listing.title.toLowerCase();
  const legacyTitleMatch = features.specialties.length === 0
    && profileRoleKeywords(profile).some((keyword) => normalizedTitle.includes(keyword.toLowerCase()));
  const careerStage = catalogCareerStage(features);
  const stageDisqualified = careerStage === null
    || !effectiveTargetStages(profile).includes(careerStage);

  // A stated requirement above the ceiling is the only hard experience signal.
  // A posting that states nothing is NOT excluded — see ELIGIBLE_SENIORITIES.
  const experienceDisqualified = features.min_years !== null
    && features.min_years > profileExperienceCeiling(profile);
  const qualificationsDisqualified = features.qualification_requirements
    ? !qualificationsEligible(features.qualification_requirements, profile, features.min_years)
    : features.min_years === null && !profile.include_unspecified_experience;

  // Enrollment and a completed doctorate are separate qualifications.
  const advancedDegreeDisqualified = features.requires_advanced_degree && (
    features.qualification_requirements?.doctorate_requirement === "enrolled"
      ? !profile.doctoral_student
      : profile.highest_education !== "doctorate"
  );
  const doctoralInternship = features.qualification_requirements?.doctoral_internship_eligibility;
  const doctoralInternshipDisqualified = careerStage === "internship" && profile.doctoral_student
    && (profile.doctoral_internships === "only"
      ? doctoralInternship !== "doctoral_only"
      : doctoralInternship !== "doctoral_only" && doctoralInternship !== "doctoral_eligible");
  const securityClearanceDisqualified = features.requires_security_clearance;

  const sponsorshipDisqualified = profile.work_authorization === "sponsorship"
    && features.sponsorship_available === false;
  const locationDisqualified = !isLocationEligibleForProfile(listing, features, profile);
  const contentDisqualified = !listing.description?.trim();
  const staleDisqualified = !evergreen && !isFreshPostedAt(listing.postedAt);
  const countryDisqualified = !isUsJobLocation(listing.location);
  const excludedTitleDisqualified = profile.excluded_titles.some((excluded) => {
    const term = excluded.trim().toLowerCase();
    if (!term) return false;
    if (term.includes(" ")) return listing.title.toLowerCase().includes(term);
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`\\b${escaped}\\b`, "i").test(listing.title);
  });

  const plausible = !experienceDisqualified
    && !qualificationsDisqualified
    && !advancedDegreeDisqualified
    && !doctoralInternshipDisqualified
    && !securityClearanceDisqualified
    && !stageDisqualified
    && !sponsorshipDisqualified
    && !locationDisqualified
    && !contentDisqualified
    && !staleDisqualified
    && !countryDisqualified
    && !excludedTitleDisqualified
    && (selectedSpecialty || customTitle || legacyTitleMatch);
  const requiredYears = features.qualification_requirements
    ? qualificationYearsForProfile(features.qualification_requirements, profile, features.min_years)
    : features.min_years;
  return {
    jobId,
    plausible,
    requiredYears: requiredYears ?? null,
  };
}

async function storeMatches(db: D1Database, userId: string, matches: UserJobMatch[]) {
  const plausible = matches.filter((match) => match.plausible);
  if (plausible.length === 0) return;
  const now = new Date().toISOString();
  for (let offset = 0; offset < plausible.length; offset += 75) {
    await db.batch(plausible.slice(offset, offset + 75).map((match) => {
      return db.prepare(
        `INSERT INTO user_job_matches (
           user_id, job_id, matcher_version, matched_at, updated_at, required_years
         )
         SELECT ?, ?, ?, ?, ?, ?
         WHERE NOT EXISTS (
           SELECT 1
           FROM job_review_queue
           WHERE job_id = ? AND state != 'approved'
         )
         ON CONFLICT(user_id, job_id) DO UPDATE SET
           matcher_version = excluded.matcher_version,
           matched_at = excluded.matched_at,
           updated_at = excluded.updated_at,
           required_years = excluded.required_years`
      ).bind(
        userId,
        match.jobId,
        MATCHER_VERSION,
        now,
        now,
        match.requiredYears ?? null,
        match.jobId
      );
    }));
  }
}

async function loadMatchableRows(db: D1Database, userId: string, jobIds?: string[]) {
  if (jobIds && jobIds.length > 0) {
    const rows: MatchableJobRow[] = [];
    for (let offset = 0; offset < jobIds.length; offset += 75) {
      const ids = jobIds.slice(offset, offset + 75);
      const placeholders = ids.map(() => "?").join(", ");
      const result = await db.prepare(
        `SELECT j.id, j.external_id, j.title, j.url, j.location, j.department,
                j.posted_at, j.first_seen_at, j.description, j.salary, j.evergreen,
                jf.role_family, jf.specialties_json, jf.seniority, jf.min_years,
                jf.max_years, jf.work_mode, jf.countries_json, jf.metro_areas_json,
                jf.salary_min, jf.salary_max, jf.salary_currency, jf.salary_period,
                jf.sponsorship_available, jf.requires_advanced_degree,
                jf.requires_security_clearance, jf.qualification_requirements_json,
                jf.classifier_version, jf.confidence
         FROM jobs j
         JOIN job_features jf ON jf.job_id = j.id
         LEFT JOIN job_review_queue jrq ON jrq.job_id = j.id
         WHERE j.id IN (${placeholders})
           AND j.description IS NOT NULL
           AND jf.classifier_version = ?
           AND jf.requires_advanced_degree IS NOT NULL
           AND jf.requires_security_clearance IS NOT NULL
           AND (jrq.job_id IS NULL OR jrq.state = 'approved')
           AND (j.evergreen = 1 OR j.posted_at IS NULL OR datetime(j.posted_at) > datetime('now', '-${MAX_POSTED_AGE_DAYS + 1} days'))`
      ).bind(...ids, JOB_CLASSIFIER_VERSION).all<MatchableJobRow>();
      rows.push(...(result.results ?? []));
    }
    return { results: rows };
  }

  const cursor = await db.prepare(
    "SELECT match_cursor_seen_at FROM user_search_profiles WHERE user_id = ?"
  ).bind(userId).first<{ match_cursor_seen_at: string | null }>();
  // No datetime() wrapping: first_seen_at is written with toISOString(), and
  // fixed-format ISO-8601 sorts lexicographically exactly as it sorts
  // chronologically. Wrapping the column in a function made idx_jobs_first_seen
  // unusable and forced a full scan + sort of every open job on each call.
  const cursorClause = cursor?.match_cursor_seen_at
    ? "AND j.first_seen_at < ?"
    : "";
  const bindings: Array<string | number> = cursor?.match_cursor_seen_at
    ? [JOB_CLASSIFIER_VERSION, cursor.match_cursor_seen_at, MATCH_WARM_BATCH_SIZE]
    : [JOB_CLASSIFIER_VERSION, MATCH_WARM_BATCH_SIZE];
  return db.prepare(
    `SELECT j.id, j.external_id, j.title, j.url, j.location, j.department,
            j.posted_at, j.first_seen_at, j.description, j.salary, j.evergreen,
            jf.role_family, jf.specialties_json, jf.seniority, jf.min_years,
            jf.max_years, jf.work_mode, jf.countries_json, jf.metro_areas_json,
            jf.salary_min, jf.salary_max, jf.salary_currency, jf.salary_period,
            jf.sponsorship_available, jf.requires_advanced_degree,
            jf.requires_security_clearance, jf.qualification_requirements_json,
            jf.classifier_version, jf.confidence
     FROM jobs j
     JOIN companies c ON c.id = j.company_id
     JOIN job_features jf ON jf.job_id = j.id
     LEFT JOIN job_review_queue jrq ON jrq.job_id = j.id
     WHERE c.enabled = 1
       AND j.closed_at IS NULL
       AND j.description IS NOT NULL
       AND jf.classifier_version = ?
       AND jf.requires_advanced_degree IS NOT NULL
       AND jf.requires_security_clearance IS NOT NULL
       AND (jrq.job_id IS NULL OR jrq.state = 'approved')
       AND (j.evergreen = 1 OR j.posted_at IS NULL OR datetime(j.posted_at) > datetime('now', '-${MAX_POSTED_AGE_DAYS + 1} days'))
       ${cursorClause}
     ORDER BY j.first_seen_at DESC
     LIMIT ?`
  ).bind(...bindings).all<MatchableJobRow>();
}

async function loadNormalCandidateFeatureStates(
  db: D1Database,
  userId: string
): Promise<CandidateFeatureState[]> {
  const cursor = await db.prepare(
    "SELECT match_cursor_seen_at FROM user_search_profiles WHERE user_id = ?"
  ).bind(userId).first<{ match_cursor_seen_at: string | null }>();
  const cursorClause = cursor?.match_cursor_seen_at
    ? "AND j.first_seen_at < ?"
    : "";
  const bindings: Array<string | number> = cursor?.match_cursor_seen_at
    ? [cursor.match_cursor_seen_at, MATCH_WARM_BATCH_SIZE]
    : [MATCH_WARM_BATCH_SIZE];
  const result = await db.prepare(
    `SELECT j.id, jf.classifier_version, jf.requires_advanced_degree,
            jf.requires_security_clearance
     FROM jobs j
     JOIN companies c ON c.id = j.company_id
     LEFT JOIN job_features jf ON jf.job_id = j.id
     LEFT JOIN job_review_queue jrq ON jrq.job_id = j.id
     WHERE c.enabled = 1
       AND j.closed_at IS NULL
       AND j.description IS NOT NULL
       AND (jrq.job_id IS NULL OR jrq.state = 'approved')
       AND (j.evergreen = 1 OR j.posted_at IS NULL OR datetime(j.posted_at) > datetime('now', '-${MAX_POSTED_AGE_DAYS + 1} days'))
       ${cursorClause}
     ORDER BY j.first_seen_at DESC
     LIMIT ?`
  ).bind(...bindings).all<CandidateFeatureState>();
  return result.results ?? [];
}

async function loadEvergreenCandidateFeatureStates(
  db: D1Database
): Promise<CandidateFeatureState[]> {
  const result = await db.prepare(
    `SELECT j.id, jf.classifier_version, jf.requires_advanced_degree,
            jf.requires_security_clearance
     FROM jobs j
     JOIN companies c ON c.id = j.company_id
     LEFT JOIN job_features jf ON jf.job_id = j.id
     LEFT JOIN job_review_queue jrq ON jrq.job_id = j.id
     WHERE c.enabled = 1 AND j.closed_at IS NULL AND j.evergreen = 1
       AND j.description IS NOT NULL
       AND (jrq.job_id IS NULL OR jrq.state = 'approved')
     ORDER BY j.first_seen_at DESC
     LIMIT 2500`
  ).all<CandidateFeatureState>();
  return result.results ?? [];
}

async function removeStaleMatches(db: D1Database, userId: string) {
  const cleanup = await db.prepare(
    "DELETE FROM user_job_matches WHERE user_id = ? AND matcher_version != ?"
  ).bind(userId, MATCHER_VERSION).run();
  if ((cleanup.meta.changes ?? 0) > 0) {
    await db.prepare(
      "UPDATE user_search_profiles SET match_cursor_seen_at = NULL WHERE user_id = ?"
    ).bind(userId).run();
  }
}

export async function ensureUserJobMatches(db: D1Database, userId: string, jobIds?: string[]) {
  await removeStaleMatches(db, userId);
  if (jobIds?.length) {
    await ensureJobFeaturesForIds(db, jobIds);
  } else {
    await ensureCurrentCandidateFeatures(
      db,
      await loadNormalCandidateFeatureStates(db, userId)
    );
  }
  const state = await loadUserPreferenceState(db, userId);
  const result = await loadMatchableRows(db, userId, jobIds);
  // SQL guards are authoritative; the runtime check is defense in depth for
  // mocked databases and any future query refactor that accidentally widens
  // the selected feature set.
  const rows = (result.results ?? []).filter(hasCurrentStoredJobFeatures);
  if (rows.length === 0) return [];

  const matches = rows.map((row) =>
    evaluateJobForProfile(
      row.id,
      rowToListing(row),
      storedJobFeaturesFromRow(row),
      state.search_profile,
      row.evergreen === 1
    )
  );
  await storeMatches(db, userId, matches);

  if (!jobIds) {
    const oldest = rows[rows.length - 1]?.first_seen_at;
    if (oldest) {
      await db.prepare(
        "UPDATE user_search_profiles SET match_cursor_seen_at = ?, updated_at = updated_at WHERE user_id = ?"
      ).bind(oldest, userId).run();
    }
  }
  return matches;
}

export async function ensureUserJobMatchesReady(
  db: D1Database,
  userId: string,
  minimumMatches = 25,
  maxBatches = 4
) {
  await removeStaleMatches(db, userId);
  for (let batch = 0; batch < maxBatches; batch++) {
    const count = await db.prepare(
      `SELECT COUNT(*) AS count
       FROM user_job_matches ujm
       JOIN jobs j ON j.id = ujm.job_id
       JOIN companies c ON c.id = j.company_id
       LEFT JOIN job_review_queue jrq ON jrq.job_id = j.id
       WHERE ujm.user_id = ? AND j.closed_at IS NULL AND c.enabled = 1
         AND ujm.matcher_version = ?
         AND j.description IS NOT NULL
         AND (jrq.job_id IS NULL OR jrq.state = 'approved')
         AND (j.evergreen = 1 OR j.posted_at IS NULL OR datetime(j.posted_at) > datetime('now', '-${MAX_POSTED_AGE_DAYS + 1} days'))`
    ).bind(userId, MATCHER_VERSION).first<{ count: number }>();
    if ((count?.count ?? 0) >= minimumMatches) return;
    const evaluated = await ensureUserJobMatches(db, userId);
    if (evaluated.length === 0) return;
  }
}

/**
 * Evergreen listings are usually older than the recent jobs scanned by the
 * normal on-demand warm-up. Warm that explicit view from the evergreen pool so
 * a new or recently edited profile does not show an empty filter while its
 * general-purpose cursor slowly works backward.
 */
export async function ensureUserEvergreenMatchesReady(
  db: D1Database,
  userId: string
) {
  await removeStaleMatches(db, userId);
  const existing = await db.prepare(
    `SELECT COUNT(*) AS count
     FROM user_job_matches ujm
     JOIN jobs j ON j.id = ujm.job_id
     JOIN companies c ON c.id = j.company_id
     LEFT JOIN job_review_queue jrq ON jrq.job_id = j.id
     WHERE ujm.user_id = ? AND ujm.matcher_version = ?
       AND c.enabled = 1 AND j.closed_at IS NULL AND j.evergreen = 1
       AND j.description IS NOT NULL
       AND (jrq.job_id IS NULL OR jrq.state = 'approved')`
  ).bind(userId, MATCHER_VERSION).first<{ count: number }>();
  if ((existing?.count ?? 0) > 0) return;

  await ensureCurrentCandidateFeatures(
    db,
    await loadEvergreenCandidateFeatureStates(db)
  );
  const state = await loadUserPreferenceState(db, userId);
  const result = await db.prepare(
    `SELECT j.id, j.external_id, j.title, j.url, j.location, j.department,
            j.posted_at, j.first_seen_at, 'available' AS description, j.salary,
            j.evergreen,
            jf.role_family, jf.specialties_json, jf.seniority, jf.min_years,
            jf.max_years, jf.work_mode, jf.countries_json, jf.metro_areas_json,
            jf.salary_min, jf.salary_max, jf.salary_currency, jf.salary_period,
            jf.sponsorship_available, jf.requires_advanced_degree,
            jf.requires_security_clearance, jf.qualification_requirements_json,
            jf.classifier_version, jf.confidence
     FROM jobs j
     JOIN companies c ON c.id = j.company_id
     JOIN job_features jf ON jf.job_id = j.id
     LEFT JOIN job_review_queue jrq ON jrq.job_id = j.id
     WHERE c.enabled = 1 AND j.closed_at IS NULL AND j.evergreen = 1
       AND j.description IS NOT NULL
       AND jf.classifier_version = ?
       AND jf.requires_advanced_degree IS NOT NULL
       AND jf.requires_security_clearance IS NOT NULL
       AND (jrq.job_id IS NULL OR jrq.state = 'approved')
     ORDER BY j.first_seen_at DESC
     LIMIT 2500`
  ).bind(JOB_CLASSIFIER_VERSION).all<MatchableJobRow>();
  const rows = (result.results ?? []).filter(hasCurrentStoredJobFeatures);
  const matches = rows.map((row) =>
    evaluateJobForProfile(
      row.id,
      rowToListing(row),
      storedJobFeaturesFromRow(row),
      state.search_profile,
      true
    )
  );
  await storeMatches(db, userId, matches);
}

// The on-demand warm-up (ensureUserJobMatchesReady) stops at 25 matches and never
// scans past the most recent jobs, so older relevant jobs never surface. Each
// cron tick, advance the matching cursor by one batch for a few users who still
// have eligible jobs older than their cursor. Fully caught-up users are skipped,
// so the backlog drains over a few ticks and then this becomes a no-op.
export async function advanceBacklogMatching(
  db: D1Database,
  maxUsers = 1
): Promise<number> {
  // This was a correlated EXISTS: for every profile it re-scanned open jobs
  // joined to companies, calling datetime() twice per row — ~94 profiles ×
  // ~3,600 open jobs in one statement. That is what exceeded D1's CPU limit and
  // killed the cron every 15 minutes from 2026-06-17 onward.
  //
  // "Some open job is older than this cursor" is equivalent to "this cursor is
  // newer than the oldest open job", so the whole correlated scan collapses to
  // one aggregate plus a plain indexed string comparison.
  const oldest = await db.prepare(
    `SELECT MIN(j.first_seen_at) AS first_seen_at
     FROM jobs j
     JOIN companies c ON c.id = j.company_id
     WHERE c.enabled = 1 AND j.closed_at IS NULL
       AND j.description IS NOT NULL
       AND (j.evergreen = 1 OR j.posted_at IS NULL OR datetime(j.posted_at) > datetime('now', '-${MAX_POSTED_AGE_DAYS + 1} days'))`
  ).first<{ first_seen_at: string | null }>();
  if (!oldest?.first_seen_at) return 0;

  // One user is intentional. A batch evaluates up to 750 jobs and can take
  // substantial D1 work; attempting 15 sequentially hit the database CPU limit
  // before fetch_runs could reach its completion update. Active users still
  // warm four batches on demand, while cron drains one inactive user's backlog
  // per tick.
  const users = await db.prepare(
    `SELECT user_id
     FROM user_search_profiles
     WHERE match_cursor_seen_at IS NOT NULL
       AND match_cursor_seen_at > ?
     ORDER BY updated_at ASC
     LIMIT ?`
  ).bind(oldest.first_seen_at, maxUsers).all<{ user_id: string }>();

  let advanced = 0;
  for (const { user_id: userId } of users.results ?? []) {
    const matches = await ensureUserJobMatches(db, userId).catch(() => [] as UserJobMatch[]);
    if (matches.length > 0) advanced += 1;
  }
  return advanced;
}

export interface JobMatchInput {
  jobId: string;
  listing: JobListing;
  evergreen?: boolean;
  features?: JobFeatures;
}

export interface PreparedJobMatchInput extends JobMatchInput {
  features: JobFeatures;
}

export function prepareJobsForMatching(
  jobs: JobMatchInput[],
  classifier: (listing: JobListing) => JobFeatures = classifyJob
): PreparedJobMatchInput[] {
  return jobs.map((job) => ({
    ...job,
    features: job.features
      && job.features.classifier_version === JOB_CLASSIFIER_VERSION
      && typeof job.features.requires_advanced_degree === "boolean"
      && typeof job.features.requires_security_clearance === "boolean"
      ? job.features
      : classifier(job.listing),
  }));
}

export async function matchListingsForUser(
  db: D1Database,
  userId: string,
  jobs: JobMatchInput[]
) {
  const state = await loadUserPreferenceState(db, userId);
  const matches = prepareJobsForMatching(jobs).map(({ jobId, listing, evergreen, features }) =>
    evaluateJobForProfile(jobId, listing, features, state.search_profile, evergreen === true)
  );
  await storeMatches(db, userId, matches);
  return matches;
}

export async function matchJobsForAllProfiles(
  db: D1Database,
  jobs: JobMatchInput[]
) {
  if (jobs.length === 0) return;
  const preparedJobs = prepareJobsForMatching(jobs);
  const users = await db.prepare(
    `SELECT user_id, profile_json, notifications_enabled,
            onboarding_version, onboarding_completed_at
     FROM user_search_profiles`
  ).all<SearchProfileRow & { user_id: string }>();
  for (const row of users.results ?? []) {
    const profile = searchProfileFromRow(row);
    const matches = preparedJobs.map(({ jobId, listing, evergreen, features }) =>
      evaluateJobForProfile(jobId, listing, features, profile, evergreen === true)
    );
    await storeMatches(db, row.user_id, matches);
  }
}

export async function invalidateJobMatches(db: D1Database, jobId: string) {
  await Promise.all([
    db.prepare("DELETE FROM user_job_matches WHERE job_id = ?").bind(jobId).run(),
    db.prepare("DELETE FROM job_features WHERE job_id = ?").bind(jobId).run(),
  ]);
}

// Used after a job's content changes (e.g. description backfilled on open).
// Recompute its features and binary eligibility for everyone who currently has
// it in their feed, plus the viewer who triggered the content refresh.
export async function rematchJobForMatchedUsers(
  db: D1Database,
  jobId: string,
  viewerUserId?: string
) {
  await db.prepare("DELETE FROM job_features WHERE job_id = ?").bind(jobId).run();
  await ensureJobFeaturesForIds(db, [jobId]);

  const matchedUsers = await db.prepare(
    "SELECT DISTINCT user_id FROM user_job_matches WHERE job_id = ?"
  ).bind(jobId).all<{ user_id: string }>();
  const userIds = new Set((matchedUsers.results ?? []).map((row) => row.user_id));
  if (viewerUserId) userIds.add(viewerUserId);

  for (const userId of userIds) {
    const matches = await ensureUserJobMatches(db, userId, [jobId]);
    const match = matches.find((entry) => entry.jobId === jobId);
    if (!match?.plausible) {
      await db.prepare(
        "DELETE FROM user_job_matches WHERE user_id = ? AND job_id = ?"
      ).bind(userId, jobId).run();
    }
  }
}
