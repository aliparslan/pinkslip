import {
  isEligibleSeniority,
  LOCATION_OPTIONS,
  MAX_YEARS_EXPERIENCE,
  ROLE_OPTIONS,
  roleLabel,
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
import { normalizeScore, scoreJob, type ScoreBreakdown } from "./scoring";
import { loadUserPreferenceState, scoringPrefsFromState } from "./user-preferences";
import { closestSelectedRole, roleAffinity } from "../shared/role-affinity";
import { isFreshPostedAt, MAX_POSTED_AGE_DAYS } from "../shared/job-policy";
import { isUsJobLocation } from "./us-jobs";

// Bump whenever scoring semantics change so cached user_job_matches are rebuilt.
// v9 makes content, freshness, country, work mode, and location deterministic
// eligibility gates while preserving explicit overlaps such as Research
// Software Engineer → SWE + Research.
// v10 adds a required doctorate as a hard disqualifier.
export const MATCH_SCORER_VERSION = "profile-v2-deterministic-10";
const MATCH_WARM_BATCH_SIZE = 750;

export interface UserJobMatch {
  jobId: string;
  breakdown: ScoreBreakdown;
  reasons: string[];
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

function buildReasons(
  listing: JobListing,
  features: JobFeatures,
  profile: SearchProfile,
  breakdown: ScoreBreakdown
): string[] {
  const reasons: string[] = [];
  const matchedRole = features.specialties
    .map((specialty) => ({ specialty, affinity: roleAffinity(specialty, profile.primary_role, profile.roles) }))
    .sort((a, b) => b.affinity - a.affinity)[0];
  const date = listing.postedAt ? new Date(listing.postedAt) : null;
  if (date && Number.isFinite(date.getTime()) && Date.now() - date.getTime() < 24 * 60 * 60 * 1000) {
    reasons.push("New today");
  }

  if (features.min_years !== null) {
    reasons.push(features.min_years === 0 ? "Entry-level requirement" : `Asks for ${features.min_years}+ years`);
  } else if (features.seniority === "new_grad" || features.seniority === "early_career") {
    reasons.push("Early-career level");
  }

  if (matchedRole?.affinity) {
    const selectedRole = closestSelectedRole(matchedRole.specialty, profile.primary_role, profile.roles);
    reasons.push(matchedRole.affinity >= 0.9
      ? `Matches your ${roleLabel(matchedRole.specialty)} focus`
      : `Related to your ${roleLabel(selectedRole ?? profile.primary_role)} focus`);
  } else if (breakdown.title_score > 0) {
    reasons.push(`${roleLabel(profile.primary_role)} title match`);
  }

  if (features.work_mode !== "unknown" && profile.work_modes.includes(features.work_mode)) {
    const country = features.countries.includes("US") ? " US" : "";
    reasons.push(`${features.work_mode[0].toUpperCase()}${features.work_mode.slice(1)}${country}`);
  } else {
    const metro = LOCATION_OPTIONS.find((location) => features.metro_areas.includes(location.id));
    if (metro && profile.location_ids.includes(metro.id)) reasons.push(metro.label);
  }

  if (features.min_years === null && !["unknown", "new_grad", "early_career"].includes(features.seniority)) {
    const level = features.seniority.replaceAll("_", " ");
    reasons.push(`${level[0].toUpperCase()}${level.slice(1)} level`);
  }

  if (profile.work_authorization === "sponsorship" && features.sponsorship_available === true) {
    reasons.push("Sponsorship available");
  }

  return [...new Set(reasons)].slice(0, 4);
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

export function scoreJobForProfile(
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
  const base = scoreJob(listing, scoringPrefsFromState({
    search_profile: profile,
    notify_threshold: profile.match_threshold,
  }));
  const strongestRoleAffinity = Math.max(
    0,
    ...features.specialties.map((specialty) => roleAffinity(specialty, profile.primary_role, profile.roles))
  );
  const selectedSpecialty = strongestRoleAffinity > 0;
  const customTitle = profile.custom_titles.some((title) => listing.title.toLowerCase().includes(title.toLowerCase()));
  const titleScore = customTitle
    ? 29
    : strongestRoleAffinity >= 1
      ? 30
      : strongestRoleAffinity >= 0.9
        ? 27
        : strongestRoleAffinity > 0
          ? 22
          : features.specialties.length > 0
            ? 0
            : base.title_score;
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

  // An explicitly in-band requirement ranks above a posting that says nothing,
  // so genuine new-grad listings float above the generic majority rather than
  // being lost among them.
  const yoeScore = features.min_years === null
    ? 19
    : features.min_years <= MAX_YEARS_EXPERIENCE
      ? 25 - features.min_years
      : 0;
  const rawScore = experienceDisqualified || seniorityDisqualified || sponsorshipDisqualified
    || locationDisqualified || contentDisqualified || staleDisqualified || countryDisqualified
    || excludedTitleDisqualified || advancedDegreeDisqualified
    ? Math.min(15, base.location_score + base.department_score + base.recency_score)
    : titleScore === 0
      ? Math.min(29, yoeScore + base.location_score + base.department_score + base.recency_score)
      : titleScore + yoeScore + base.location_score + base.department_score + base.recency_score;
  const breakdown: ScoreBreakdown = {
    ...base,
    score: rawScore,
    title_score: titleScore,
    yoe_score: yoeScore,
  };
  const normalized = normalizeScore(breakdown.score);
  const plausible = !experienceDisqualified
    && !advancedDegreeDisqualified
    && !seniorityDisqualified
    && !sponsorshipDisqualified
    && !locationDisqualified
    && !contentDisqualified
    && !staleDisqualified
    && !countryDisqualified
    && !excludedTitleDisqualified
    && (selectedSpecialty || customTitle || breakdown.title_score > 0)
    && normalized >= 25;
  return {
    jobId,
    breakdown,
    reasons: buildReasons(listing, features, profile, breakdown),
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
           user_id, job_id, score, title_score, yoe_score, location_score,
           department_score, recency_score, reasons_json, scorer_version,
           matched_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(user_id, job_id) DO UPDATE SET
           score = excluded.score,
           title_score = excluded.title_score,
           yoe_score = excluded.yoe_score,
           location_score = excluded.location_score,
           department_score = excluded.department_score,
           recency_score = excluded.recency_score,
           reasons_json = excluded.reasons_json,
           scorer_version = excluded.scorer_version,
           matched_at = excluded.matched_at,
           updated_at = excluded.updated_at`
      ).bind(
        userId,
        match.jobId,
        match.breakdown.score,
        match.breakdown.title_score,
        match.breakdown.yoe_score,
        match.breakdown.location_score,
        match.breakdown.department_score,
        match.breakdown.recency_score,
        JSON.stringify(match.reasons),
        MATCH_SCORER_VERSION,
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
       WHERE j.id IN (${placeholders})
         AND j.description IS NOT NULL
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
     WHERE c.enabled = 1
       AND j.closed_at IS NULL
       AND j.description IS NOT NULL
       AND (j.evergreen = 1 OR j.posted_at IS NULL OR datetime(j.posted_at) > datetime('now', '-${MAX_POSTED_AGE_DAYS + 1} days'))
       ${cursorClause}
     ORDER BY j.first_seen_at DESC
     LIMIT ?`
  ).bind(...bindings).all<MatchableJobRow>();
}

async function removeStaleMatches(db: D1Database, userId: string) {
  const cleanup = await db.prepare(
    "DELETE FROM user_job_matches WHERE user_id = ? AND scorer_version != ?"
  ).bind(userId, MATCH_SCORER_VERSION).run();
  if ((cleanup.meta.changes ?? 0) > 0) {
    await db.prepare(
      "UPDATE user_search_profiles SET match_cursor_seen_at = NULL WHERE user_id = ?"
    ).bind(userId).run();
  }
}

export async function ensureUserJobScores(db: D1Database, userId: string, jobIds?: string[]) {
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
    scoreJobForProfile(row.id, rowToListing(row), rowToFeatures(row), state.search_profile, row.evergreen === 1)
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
       WHERE ujm.user_id = ? AND j.closed_at IS NULL AND c.enabled = 1
         AND j.description IS NOT NULL
         AND (j.evergreen = 1 OR j.posted_at IS NULL OR datetime(j.posted_at) > datetime('now', '-${MAX_POSTED_AGE_DAYS + 1} days'))`
    ).bind(userId).first<{ count: number }>();
    if ((count?.count ?? 0) >= minimumMatches) return;
    const evaluated = await ensureUserJobScores(db, userId);
    if (evaluated.length === 0) return;
  }
}

// The on-demand warm-up (ensureUserJobMatchesReady) stops at 25 matches and never
// scans past the most recent jobs, so older relevant jobs never surface. Each
// cron tick, advance the scoring cursor by one batch for a few users who still
// have eligible jobs older than their cursor. Fully caught-up users are skipped,
// so the backlog drains over a few ticks and then this becomes a no-op.
export async function advanceBacklogScoring(
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
    const matches = await ensureUserJobScores(db, userId).catch(() => [] as UserJobMatch[]);
    if (matches.length > 0) advanced += 1;
  }
  return advanced;
}

export async function scoreListingsForUser(
  db: D1Database,
  userId: string,
  jobs: Array<{ jobId: string; listing: JobListing }>
) {
  const state = await loadUserPreferenceState(db, userId);
  const matches = jobs.map(({ jobId, listing }) =>
    scoreJobForProfile(jobId, listing, classifyJob(listing), state.search_profile)
  );
  await storeMatches(db, userId, matches);
  return matches;
}

export async function matchJobsForAllProfiles(
  db: D1Database,
  jobs: Array<{ jobId: string; listing: JobListing }>
) {
  if (jobs.length === 0) return;
  const users = await db.prepare("SELECT user_id FROM user_search_profiles")
    .all<{ user_id: string }>();
  for (const { user_id: userId } of users.results ?? []) {
    await scoreListingsForUser(db, userId, jobs);
  }
}

export async function invalidateJobScores(db: D1Database, jobId: string) {
  await Promise.all([
    db.prepare("DELETE FROM user_job_matches WHERE job_id = ?").bind(jobId).run(),
    db.prepare("DELETE FROM job_features WHERE job_id = ?").bind(jobId).run(),
  ]);
}

// Used after a job's content changes (e.g. description backfilled on open).
// Recompute its features and re-score it for everyone who currently has it in
// their feed — plus the viewer who triggered the change — so it stays visible
// with an updated score instead of being dropped from every feed until some
// future warm-up happens to reach it. A job that genuinely stops matching is
// removed only for the users it no longer fits.
export async function rescoreJobForMatchedUsers(
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
    const matches = await ensureUserJobScores(db, userId, [jobId]);
    const match = matches.find((entry) => entry.jobId === jobId);
    if (!match?.plausible) {
      await db.prepare(
        "DELETE FROM user_job_matches WHERE user_id = ? AND job_id = ?"
      ).bind(userId, jobId).run();
    }
  }
}
