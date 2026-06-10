import { LOCATION_OPTIONS, ROLE_OPTIONS, roleLabel, type SearchProfile } from "../shared/search-profile";
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

export const MATCH_SCORER_VERSION = "profile-v2-deterministic-4";
const MATCH_WARM_BATCH_SIZE = 750;

export interface UserJobMatch {
  jobId: string;
  breakdown: ScoreBreakdown;
  reasons: string[];
  plausible: boolean;
  shadowScore: number;
  shadowReasons: string[];
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
  classifier_version: string;
  confidence: number;
}

type MatchableJobRow = FeatureJobRow & FeatureColumns;
type ScorerRollout = {
  scorer_version: string;
  mode: "off" | "shadow" | "active";
  cohort_percent: number;
};

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
  const matchedRole = features.specialties.find((specialty) => profile.roles.includes(specialty));
  if (matchedRole) {
    reasons.push(`${roleLabel(matchedRole)} role`);
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

  if (features.min_years !== null) {
    reasons.push(`Asks for ${features.min_years}+ years`);
  } else if (features.seniority !== "unknown") {
    const level = features.seniority.replaceAll("_", " ");
    reasons.push(`${level[0].toUpperCase()}${level.slice(1)} level`);
  }

  if (profile.work_authorization === "sponsorship" && features.sponsorship_available === true) {
    reasons.push("Sponsorship available");
  }

  const date = listing.postedAt ? new Date(listing.postedAt) : null;
  if (date && Number.isFinite(date.getTime()) && Date.now() - date.getTime() < 24 * 60 * 60 * 1000) {
    reasons.push("New today");
  }

  return [...new Set(reasons)].slice(0, 4);
}

export function scoreJobForProfile(
  jobId: string,
  listing: JobListing,
  features: JobFeatures,
  profile: SearchProfile
): UserJobMatch {
  const base = scoreJob(listing, scoringPrefsFromState({
    search_profile: profile,
    notify_threshold: profile.match_threshold,
  }));
  const selectedSpecialty = features.specialties.some((specialty) => profile.roles.includes(specialty));
  const customTitle = profile.custom_titles.some((title) => listing.title.toLowerCase().includes(title.toLowerCase()));
  const titleScore = selectedSpecialty || customTitle ? 30 : base.title_score;
  const stretchYears = profile.stretch_tolerance === "strict"
    ? 0
    : profile.stretch_tolerance === "balanced"
      ? 2
      : 4;
  const experienceDisqualified = features.min_years !== null
    && features.min_years > profile.years_experience + stretchYears;
  const seniorityRank: Record<JobFeatures["seniority"], number> = {
    internship: 0,
    new_grad: 1,
    early_career: 2,
    mid_level: 3,
    senior: 4,
    staff_plus: 5,
    manager: 5,
    executive: 6,
    unknown: -1,
  };
  const targetRank = Math.max(...profile.target_levels.map((level) => seniorityRank[level]));
  const levelAllowance = profile.stretch_tolerance === "strict"
    ? 0
    : profile.stretch_tolerance === "balanced"
      ? 1
      : 2;
  const featureRank = seniorityRank[features.seniority];
  const seniorityDisqualified = featureRank >= 0 && featureRank > targetRank + levelAllowance;
  const sponsorshipDisqualified = profile.work_authorization === "sponsorship"
    && features.sponsorship_available === false;
  const yoeScore = features.min_years === null
    ? base.yoe_score
    : features.min_years <= profile.years_experience
      ? 25
      : experienceDisqualified
        ? 0
        : 10;
  const rawScore = experienceDisqualified || seniorityDisqualified || sponsorshipDisqualified
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
    && !seniorityDisqualified
    && !sponsorshipDisqualified
    && (selectedSpecialty || customTitle || breakdown.title_score > 0)
    && normalized >= 25;
  const shadowReasons: string[] = [];
  let shadowScore = breakdown.score;
  if (features.specialties.includes(profile.primary_role)) {
    shadowScore += 3;
    shadowReasons.push("primary_role_bonus");
  } else if (selectedSpecialty) {
    shadowScore -= 2;
    shadowReasons.push("secondary_role_penalty");
  }
  if (features.min_years === null && features.seniority === "unknown") {
    shadowScore -= 3;
    shadowReasons.push("unknown_experience_penalty");
  }
  if (features.confidence < 0.6) {
    shadowScore -= 3;
    shadowReasons.push("low_classifier_confidence");
  }
  shadowScore = Math.max(0, Math.min(95, shadowScore));
  return {
    jobId,
    breakdown,
    reasons: buildReasons(listing, features, profile, breakdown),
    plausible,
    shadowScore,
    shadowReasons,
  };
}

async function loadScorerRollout(db: D1Database): Promise<ScorerRollout | null> {
  return db.prepare(
    `SELECT scorer_version, mode, cohort_percent
     FROM scorer_rollouts
     WHERE mode != 'off'
     ORDER BY datetime(updated_at) DESC
     LIMIT 1`
  ).first<ScorerRollout>();
}

async function storeMatches(db: D1Database, userId: string, matches: UserJobMatch[]) {
  const plausible = matches.filter((match) => match.plausible);
  if (plausible.length === 0) return;
  const now = new Date().toISOString();
  const rollout = await loadScorerRollout(db);
  const candidateEnabled = Boolean(
    rollout && scorerCohortBucket(userId) < rollout.cohort_percent
  );
  for (let offset = 0; offset < plausible.length; offset += 75) {
    await db.batch(plausible.slice(offset, offset + 75).map((match) => {
      const candidateActive = candidateEnabled && rollout?.mode === "active";
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
        candidateActive ? match.shadowScore : match.breakdown.score,
        match.breakdown.title_score,
        match.breakdown.yoe_score,
        match.breakdown.location_score,
        match.breakdown.department_score,
        match.breakdown.recency_score,
        JSON.stringify(match.reasons),
        candidateActive ? rollout!.scorer_version : MATCH_SCORER_VERSION,
        now,
        now
      );
    }));
  }
  if (rollout && candidateEnabled) {
    await storeScorerAudits(db, userId, plausible, rollout);
  }
}

export function scorerCohortBucket(userId: string): number {
  let hash = 2166136261;
  for (const char of userId) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash) % 100;
}

async function storeScorerAudits(
  db: D1Database,
  userId: string,
  matches: UserJobMatch[],
  rollout: ScorerRollout
) {
  if (matches.length === 0) return;

  const now = new Date().toISOString();
  for (let offset = 0; offset < matches.length; offset += 75) {
    await db.batch(matches.slice(offset, offset + 75).map((match) =>
      db.prepare(
        `INSERT INTO scorer_audits (
           user_id, job_id, stable_version, candidate_version,
           stable_score, candidate_score, delta, reasons_json, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(user_id, job_id, candidate_version) DO UPDATE SET
           stable_version = excluded.stable_version,
           stable_score = excluded.stable_score,
           candidate_score = excluded.candidate_score,
           delta = excluded.delta,
           reasons_json = excluded.reasons_json,
           created_at = excluded.created_at`
      ).bind(
        userId,
        match.jobId,
        MATCH_SCORER_VERSION,
        rollout.scorer_version,
        match.breakdown.score,
        match.shadowScore,
        match.shadowScore - match.breakdown.score,
        JSON.stringify(match.shadowReasons),
        now
      )
    ));
  }
}

async function loadMatchableRows(db: D1Database, userId: string, jobIds?: string[]) {
  if (jobIds && jobIds.length > 0) {
    const placeholders = jobIds.map(() => "?").join(", ");
    return db.prepare(
      `SELECT j.id, j.external_id, j.title, j.url, j.location, j.department,
              j.posted_at, j.first_seen_at, j.description, j.salary,
              jf.role_family, jf.specialties_json, jf.seniority, jf.min_years,
              jf.max_years, jf.work_mode, jf.countries_json, jf.metro_areas_json,
              jf.salary_min, jf.salary_max, jf.salary_currency, jf.salary_period,
              jf.sponsorship_available,
              jf.classifier_version, jf.confidence
       FROM jobs j
       JOIN job_features jf ON jf.job_id = j.id
       WHERE j.id IN (${placeholders})`
    ).bind(...jobIds).all<MatchableJobRow>();
  }

  const cursor = await db.prepare(
    "SELECT match_cursor_seen_at FROM user_search_profiles WHERE user_id = ?"
  ).bind(userId).first<{ match_cursor_seen_at: string | null }>();
  const cursorClause = cursor?.match_cursor_seen_at
    ? "AND datetime(j.first_seen_at) < datetime(?)"
    : "";
  const bindings: Array<string | number> = cursor?.match_cursor_seen_at
    ? [cursor.match_cursor_seen_at, MATCH_WARM_BATCH_SIZE]
    : [MATCH_WARM_BATCH_SIZE];
  return db.prepare(
    `SELECT j.id, j.external_id, j.title, j.url, j.location, j.department,
            j.posted_at, j.first_seen_at, j.description, j.salary,
            jf.role_family, jf.specialties_json, jf.seniority, jf.min_years,
            jf.max_years, jf.work_mode, jf.countries_json, jf.metro_areas_json,
            jf.salary_min, jf.salary_max, jf.salary_currency, jf.salary_period,
            jf.sponsorship_available,
            jf.classifier_version, jf.confidence
     FROM jobs j
     JOIN companies c ON c.id = j.company_id
     JOIN job_features jf ON jf.job_id = j.id
     WHERE c.enabled = 1
       AND j.closed_at IS NULL
       ${cursorClause}
     ORDER BY datetime(j.first_seen_at) DESC
     LIMIT ?`
  ).bind(...bindings).all<MatchableJobRow>();
}

async function removeStaleMatches(db: D1Database, userId: string) {
  const rollout = await loadScorerRollout(db);
  const activeVersion = rollout?.mode === "active"
    && scorerCohortBucket(userId) < rollout.cohort_percent
    ? rollout.scorer_version
    : MATCH_SCORER_VERSION;
  const cleanup = await db.prepare(
    "DELETE FROM user_job_matches WHERE user_id = ? AND scorer_version != ?"
  ).bind(userId, activeVersion).run();
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
    scoreJobForProfile(row.id, rowToListing(row), rowToFeatures(row), state.search_profile)
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
       WHERE ujm.user_id = ? AND j.closed_at IS NULL AND c.enabled = 1`
    ).bind(userId).first<{ count: number }>();
    if ((count?.count ?? 0) >= minimumMatches) return;
    const evaluated = await ensureUserJobScores(db, userId);
    if (evaluated.length === 0) return;
  }
}

// The on-demand warm-up (ensureUserJobMatchesReady) stops at 25 matches and never
// scans past the most recent jobs, so older strong matches never surface. Each
// cron tick, advance the scoring cursor by one batch for a few users who still
// have eligible jobs older than their cursor. Fully caught-up users are skipped,
// so the backlog drains over a few ticks and then this becomes a no-op.
export async function advanceBacklogScoring(
  db: D1Database,
  maxUsers = 15
): Promise<number> {
  const users = await db.prepare(
    `SELECT usp.user_id
     FROM user_search_profiles usp
     WHERE usp.match_cursor_seen_at IS NOT NULL
       AND EXISTS (
         SELECT 1 FROM jobs j
         JOIN companies c ON c.id = j.company_id
         WHERE c.enabled = 1
           AND j.closed_at IS NULL
           AND datetime(j.first_seen_at) < datetime(usp.match_cursor_seen_at)
       )
     ORDER BY datetime(usp.updated_at) ASC
     LIMIT ?`
  ).bind(maxUsers).all<{ user_id: string }>();

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
