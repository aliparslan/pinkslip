import {
  DEFAULT_SEARCH_PROFILE,
  LOCATION_OPTIONS,
  ONBOARDING_VERSION,
  ROLE_OPTIONS,
  normalizeSearchProfile,
  type ExperienceLevel,
  type LocationId,
  type RoleId,
  type SearchProfile,
} from "../shared/search-profile";
import { readUserPreferences } from "./account";

export interface UserPreferenceState {
  search_profile: SearchProfile;
}

interface SearchProfileRow {
  profile_json: string;
  notifications_enabled: number;
  onboarding_version: number;
  onboarding_completed_at: string | null;
}

const LEGACY_SENIORITY_EXCLUSIONS = new Set([
  "senior", "sr", "sr.", "lead", "staff", "principal", "director",
  "vice president", "vp", "head of", "manager", "intern", "internship", "senior staff",
]);

function list(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function inferRoles(keywords: string[]): RoleId[] {
  const normalized = keywords.map((keyword) => keyword.toLowerCase());
  const matches = ROLE_OPTIONS
    .filter((option) => option.keywords.some((keyword) => normalized.some((legacy) => keyword.includes(legacy) || legacy.includes(keyword))))
    .map((option) => option.id);
  return matches.length > 0 ? matches : [...DEFAULT_SEARCH_PROFILE.roles];
}

function inferLocations(locations: string[]): {
  remote: boolean;
  locationIds: LocationId[];
  customLocations: string[];
} {
  const normalized = locations.map((location) => location.trim().toLowerCase()).filter(Boolean);
  const remote = normalized.some((location) => location === "remote");
  const locationIds = LOCATION_OPTIONS
    .filter((option) => normalized.some((location) =>
      option.label.toLowerCase().includes(location)
      || location.includes(option.label.toLowerCase())
      || option.aliases.some((alias) => alias.includes(location) || location.includes(alias))
    ))
    .map((option) => option.id);
  const customLocations = locations.filter((location) => {
    const lower = location.trim().toLowerCase();
    return lower !== "remote" && !LOCATION_OPTIONS.some((option) =>
      option.label.toLowerCase().includes(lower)
      || lower.includes(option.label.toLowerCase())
      || option.aliases.some((alias) => alias.includes(lower) || lower.includes(alias))
    );
  });
  return { remote, locationIds, customLocations };
}

function inferExperience(maxYoe: unknown): ExperienceLevel {
  const max = typeof maxYoe === "number" ? maxYoe : Number(maxYoe);
  if (!Number.isFinite(max)) return DEFAULT_SEARCH_PROFILE.target_levels[0];
  if (max <= 0) return "internship";
  if (max <= 1) return "new_grad";
  if (max <= 3) return "early_career";
  if (max <= 6) return "mid_level";
  if (max <= 10) return "senior";
  return "staff_plus";
}

export function searchProfileFromLegacy(preferences: Record<string, unknown>): SearchProfile {
  const inferredLocations = inferLocations(list(preferences.locations));
  const level = inferExperience(preferences.max_yoe);
  const roles = inferRoles(list(preferences.role_keywords));
  return normalizeSearchProfile({
    roles,
    primary_role: roles[0],
    experience_level: level,
    years_experience: Number(preferences.max_yoe),
    target_levels: [level],
    work_modes: inferredLocations.remote ? ["remote", "hybrid", "onsite"] : ["hybrid", "onsite"],
    location_ids: inferredLocations.locationIds,
    custom_locations: inferredLocations.customLocations,
    custom_titles: [],
    excluded_titles: list(preferences.negative_keywords)
      .filter((keyword) => !LEGACY_SENIORITY_EXCLUSIONS.has(keyword.trim().toLowerCase())),
  });
}

export function preferenceStateFromRecord(preferences: Record<string, unknown>): UserPreferenceState {
  const hasLegacyProfile = ["locations", "min_yoe", "max_yoe", "role_keywords", "negative_keywords"]
    .some((key) => preferences[key] !== undefined);
  const baseProfile = preferences.search_profile
    ? normalizeSearchProfile(preferences.search_profile)
    : hasLegacyProfile
      ? searchProfileFromLegacy(preferences)
      : normalizeSearchProfile(DEFAULT_SEARCH_PROFILE);
  const profile = hasLegacyProfile && baseProfile.onboarding_version === 0
    ? normalizeSearchProfile({
        ...baseProfile,
        onboarding_version: ONBOARDING_VERSION,
        onboarding_completed_at: new Date().toISOString(),
      })
    : baseProfile;
  return { search_profile: profile };
}

async function persistTypedProfile(db: D1Database, userId: string, profile: SearchProfile) {
  const now = new Date().toISOString();
  await db.prepare(
    `INSERT INTO user_search_profiles (
       user_id, profile_json, notifications_enabled,
       onboarding_version, onboarding_completed_at, match_cursor_seen_at,
       created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, NULL, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       profile_json = excluded.profile_json,
       notifications_enabled = excluded.notifications_enabled,
       onboarding_version = excluded.onboarding_version,
       onboarding_completed_at = excluded.onboarding_completed_at,
       match_cursor_seen_at = NULL,
       updated_at = excluded.updated_at`
  ).bind(
    userId,
    JSON.stringify(profile),
    profile.notifications_enabled ? 1 : 0,
    profile.onboarding_version,
    profile.onboarding_completed_at,
    now,
    now
  ).run();
}

export async function loadUserPreferenceState(db: D1Database, userId: string): Promise<UserPreferenceState> {
  const row = await db.prepare(
    `SELECT profile_json, notifications_enabled,
            onboarding_version, onboarding_completed_at
     FROM user_search_profiles
     WHERE user_id = ?`
  ).bind(userId).first<SearchProfileRow>();

  if (row) {
    const profile = normalizeSearchProfile({
      ...JSON.parse(row.profile_json),
      notifications_enabled: row.notifications_enabled === 1,
      onboarding_version: row.onboarding_version,
      onboarding_completed_at: row.onboarding_completed_at,
    });
    return { search_profile: profile };
  }

  const legacy = preferenceStateFromRecord(await readUserPreferences(db, userId));
  await persistTypedProfile(db, userId, legacy.search_profile);
  return legacy;
}

export function defaultUserPreferenceState(): UserPreferenceState {
  const searchProfile = normalizeSearchProfile(DEFAULT_SEARCH_PROFILE);
  return { search_profile: searchProfile };
}

export async function saveUserPreferenceState(
  db: D1Database,
  userId: string,
  input: { search_profile?: unknown }
): Promise<UserPreferenceState> {
  const current = await loadUserPreferenceState(db, userId);
  const nextProfile = normalizeSearchProfile({
    ...(input.search_profile === undefined ? current.search_profile : input.search_profile as object),
  });
  const changed = JSON.stringify(current.search_profile) !== JSON.stringify(nextProfile);

  await persistTypedProfile(db, userId, nextProfile);
  if (input.search_profile !== undefined) {
    await db.prepare(
      `INSERT INTO user_notification_settings (user_id, enabled, push_enabled, updated_at)
       VALUES (?, ?, 1, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         enabled = excluded.enabled,
         updated_at = excluded.updated_at`
    ).bind(userId, nextProfile.notifications_enabled ? 1 : 0, new Date().toISOString()).run();
  }

  if (changed) {
    await db.prepare("DELETE FROM user_job_matches WHERE user_id = ?").bind(userId).run();
  }

  return { search_profile: nextProfile };
}
