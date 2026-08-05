import {
  isEligibleSeniority,
  MAX_YEARS_EXPERIENCE,
  profileRoleKeywords,
  type SearchProfile,
} from "../shared/search-profile";
import type { JobListing } from "./adapters/types";
import {
  classifyJob,
  ensureJobFeatures,
  ensureJobFeaturesForIds,
  rowToListing,
  type FeatureJobRow,
  type JobFeatures,
} from "./job-features";
import { loadUserPreferenceState } from "./user-preferences";
import { roleAffinity } from "../shared/role-affinity";
import { isFreshPostedAt, MAX_POSTED_AGE_DAYS } from "../shared/job-policy";
import { isUsJobLocation } from "./us-jobs";

// Bump whenever binary eligibility semantics change so cached matches rebuild.
export const MATCHER_VERSION = "profile-v3-binary-1";
const MATCH_WARM_BATCH_SIZE = 750;

export interface UserJobMatch {
  jobId: string;
  plausible: boolean;
}

interface FeatureColumns {
  role_family: JobFeatures["role_family"];
  specialties_json: string;
  seniority: JobFeatures["seniority"];
  min_years: number | null;
  max_years: number | null;
  work_mode: JobFeatures["work_mode"];
  countries_json: string;
  metro_areas_json: string;
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string | null;
  salary_period: JobFeatures["salary_period"];
  sponsorship_available: number | null;
  requires_advanced_degree: number | null;
  classifier_version: string;
  confidence: number;
}

type MatchableJobRow = FeatureJobRow & FeatureColumns & { evergreen: number | null };
function parseJsonList<T extends string>(value: string): T[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is T => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function rowToFeatures(row: FeatureColumns): JobFeatures {
  return {
    role_family: row.role_family,
    specialties: parseJsonList(row.specialties_json),
    seniority: row.seniority,
    min_years: row.min_years,
    max_years: row.max_years,
    work_mode: row.work_mode,
    countries: parseJsonList(row.countries_json),
    metro_areas: parseJsonList(row.metro_areas_json),
    salary_min: row.salary_min,
    salary_max: row.salary_max,
    salary_currency: row.salary_currency,
    salary_period: row.salary_period,
    sponsorship_available: row.sponsorship_available === null
      ? null
      : row.sponsorship_available === 1,
    requires_advanced_degree: row.requires_advanced_degree === 1,
    classifier_version: row.classifier_version,
    confidence: row.confidence,
  };
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
  const strongestRoleAffinity = Math.max(
    0,
    ...features.specialties.map((specialty) => roleAffinity(specialty, profile.primary_role, profile.roles))
  );
  const selectedSpecialty = strongestRoleAffinity > 0;
  const customTitle = profile.custom_titles.some((title) => listing.title.toLowerCase().includes(title.toLowerCase()));
  const normalizedTitle = listing.title.toLowerCase();
  const legacyTitleMatch = features.specialties.length === 0
    && profileRoleKeywords(profile).some((keyword) => normalizedTitle.includes(keyword.toLowerCase()));
  // Seniority is a fixed band, not a comparison against the user's selection.
  // The old form was `featureRank > Math.max(...target_levels) + allowance`,
  // which enforced a ceiling and no floor: selecting "Senior" alongside "Early
  // career" raised the ceiling to staff+ and admitted everything beneath it.
  const seniorityDisqualified = !isEligibleSeniority(features.seniority);

  // A stated requirement above the ceiling is the only hard experience signal.
  // A posting that states nothing is NOT excluded — see ELIGIBLE_SENIORITIES.
  const experienceDisqualified = features.min_years !== null
    && features.min_years > MAX_YEARS_EXPERIENCE;

  // A required doctorate rules a posting out regardless of stated years. These
  // roles read as early-career to every other signal — no years requirement, no
  // seniority marker in the title — which is exactly why they dominated the
  // unknown-experience bucket.
  const advancedDegreeDisqualified = features.requires_advanced_degree;

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
    && !advancedDegreeDisqualified
    && !seniorityDisqualified
    && !sponsorshipDisqualified
    && !locationDisqualified
    && !contentDisqualified
    && !staleDisqualified
    && !countryDisqualified
    && !excludedTitleDisqualified
    && (selectedSpecialty || customTitle || legacyTitleMatch);
  return {
    jobId,
    plausible,
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
           user_id, job_id, matcher_version, matched_at, updated_at
         ) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(user_id, job_id) DO UPDATE SET
           matcher_version = excluded.matcher_version,
           matched_at = excluded.matched_at,
           updated_at = excluded.updated_at`
      ).bind(
        userId,
        match.jobId,
        MATCHER_VERSION,
        now,
        now
      );
    }));
  }
}

async function loadMatchableRows(db: D1Database, userId: string, jobIds?: string[]) {
  if (jobIds && jobIds.length > 0) {
    const placeholders = jobIds.map(() => "?").join(", ");
    return db.prepare(
      `SELECT j.id, j.external_id, j.title, j.url, j.location, j.department,
              j.posted_at, j.first_seen_at, j.description, j.salary, j.evergreen,
              jf.role_family, jf.specialties_json, jf.seniority, jf.min_years,
              jf.max_years, jf.work_mode, jf.countries_json, jf.metro_areas_json,
              jf.salary_min, jf.salary_max, jf.salary_currency, jf.salary_period,
              jf.sponsorship_available, jf.requires_advanced_degree,
              jf.classifier_version, jf.confidence
       FROM jobs j
       JOIN job_features jf ON jf.job_id = j.id
       LEFT JOIN job_review_queue jrq ON jrq.job_id = j.id
       WHERE j.id IN (${placeholders})
         AND j.description IS NOT NULL
         AND (jrq.job_id IS NULL OR jrq.state = 'approved')
         AND (j.evergreen = 1 OR j.posted_at IS NULL OR datetime(j.posted_at) > datetime('now', '-${MAX_POSTED_AGE_DAYS + 1} days'))`
    ).bind(...jobIds).all<MatchableJobRow>();
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
    ? [cursor.match_cursor_seen_at, MATCH_WARM_BATCH_SIZE]
    : [MATCH_WARM_BATCH_SIZE];
  return db.prepare(
    `SELECT j.id, j.external_id, j.title, j.url, j.location, j.department,
            j.posted_at, j.first_seen_at, j.description, j.salary, j.evergreen,
            jf.role_family, jf.specialties_json, jf.seniority, jf.min_years,
            jf.max_years, jf.work_mode, jf.countries_json, jf.metro_areas_json,
            jf.salary_min, jf.salary_max, jf.salary_currency, jf.salary_period,
            jf.sponsorship_available, jf.requires_advanced_degree,
            jf.classifier_version, jf.confidence
     FROM jobs j
     JOIN companies c ON c.id = j.company_id
     JOIN job_features jf ON jf.job_id = j.id
     LEFT JOIN job_review_queue jrq ON jrq.job_id = j.id
     WHERE c.enabled = 1
       AND j.closed_at IS NULL
       AND j.description IS NOT NULL
       AND (jrq.job_id IS NULL OR jrq.state = 'approved')
       AND (j.evergreen = 1 OR j.posted_at IS NULL OR datetime(j.posted_at) > datetime('now', '-${MAX_POSTED_AGE_DAYS + 1} days'))
       ${cursorClause}
     ORDER BY j.first_seen_at DESC
     LIMIT ?`
  ).bind(...bindings).all<MatchableJobRow>();
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
    await ensureJobFeatures(db, MATCH_WARM_BATCH_SIZE);
  }
  const state = await loadUserPreferenceState(db, userId);
  const result = await loadMatchableRows(db, userId, jobIds);
  const rows = result.results ?? [];
  if (rows.length === 0) return [];

  const matches = rows.map((row) =>
    evaluateJobForProfile(row.id, rowToListing(row), rowToFeatures(row), state.search_profile, row.evergreen === 1)
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
         AND j.description IS NOT NULL
         AND (jrq.job_id IS NULL OR jrq.state = 'approved')
         AND (j.evergreen = 1 OR j.posted_at IS NULL OR datetime(j.posted_at) > datetime('now', '-${MAX_POSTED_AGE_DAYS + 1} days'))`
    ).bind(userId).first<{ count: number }>();
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

  const state = await loadUserPreferenceState(db, userId);
  const result = await db.prepare(
    `SELECT j.id, j.external_id, j.title, j.url, j.location, j.department,
            j.posted_at, j.first_seen_at, 'available' AS description, j.salary,
            j.evergreen,
            jf.role_family, jf.specialties_json, jf.seniority, jf.min_years,
            jf.max_years, jf.work_mode, jf.countries_json, jf.metro_areas_json,
            jf.salary_min, jf.salary_max, jf.salary_currency, jf.salary_period,
            jf.sponsorship_available, jf.requires_advanced_degree,
            jf.classifier_version, jf.confidence
     FROM jobs j
     JOIN companies c ON c.id = j.company_id
     JOIN job_features jf ON jf.job_id = j.id
     LEFT JOIN job_review_queue jrq ON jrq.job_id = j.id
     WHERE c.enabled = 1 AND j.closed_at IS NULL AND j.evergreen = 1
       AND j.description IS NOT NULL
       AND (jrq.job_id IS NULL OR jrq.state = 'approved')
     ORDER BY j.first_seen_at DESC
     LIMIT 2500`
  ).all<MatchableJobRow>();
  const rows = result.results ?? [];
  const matches = rows.map((row) =>
    evaluateJobForProfile(
      row.id,
      rowToListing(row),
      rowToFeatures(row),
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

export async function matchListingsForUser(
  db: D1Database,
  userId: string,
  jobs: Array<{ jobId: string; listing: JobListing; evergreen?: boolean }>
) {
  const state = await loadUserPreferenceState(db, userId);
  const matches = jobs.map(({ jobId, listing, evergreen }) =>
    evaluateJobForProfile(jobId, listing, classifyJob(listing), state.search_profile, evergreen === true)
  );
  await storeMatches(db, userId, matches);
  return matches;
}

export async function matchJobsForAllProfiles(
  db: D1Database,
  jobs: Array<{ jobId: string; listing: JobListing; evergreen?: boolean }>
) {
  if (jobs.length === 0) return;
  const users = await db.prepare("SELECT user_id FROM user_search_profiles")
    .all<{ user_id: string }>();
  for (const { user_id: userId } of users.results ?? []) {
    await matchListingsForUser(db, userId, jobs);
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
