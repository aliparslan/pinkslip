import {
  CAREER_STAGE_OPTIONS, DEFAULT_SEARCH_PROFILE, LOCATION_OPTIONS, normalizeSearchProfile, ROLE_OPTIONS,
  type RoleId, type SearchProfile,
} from "@pinkslip/domain/search-profile";

export type Profile = SearchProfile;
export type ProfilePatch = Partial<Profile>;

export const allRoles = ROLE_OPTIONS.map((option) => option.id) as RoleId[];

/** The web shows forward-deployed roles as part of SWE (the iOS app lists
 * them separately). */
export const visibleRoles = ROLE_OPTIONS.filter((option) => option.id !== "forward_deployed");

export const NO_ROLE_PREFERENCE = "any";

export const hasNoRolePreference = (profile: Profile) =>
  profile.roles.length === allRoles.length && allRoles.every((role) => profile.roles.includes(role));

export const hasNoLocationPreference = (profile: Profile) => profile.relocation_willing || profile.location_ids.length === 0;

const expand = (roles: readonly string[]): RoleId[] =>
  [...new Set(roles.flatMap((role) => (role === "software_engineering" ? ["software_engineering", "forward_deployed"] : [role])))] as RoleId[];

/** The chips' value: "any" alone, or the visible roles chosen. */
export function roleChips(profile: Profile): string[] {
  if (hasNoRolePreference(profile)) return [NO_ROLE_PREFERENCE];
  return visibleRoles.filter((option) => profile.roles.includes(option.id)
    || (option.id === "software_engineering" && profile.roles.includes("forward_deployed"))).map((option) => option.id);
}

/** Turns the chips' next value into roles (`SearchProfileFields.svelte`'s
 * toggles): "No preference" is exclusive, and picking a role while it's on
 * starts a selection with just that role. */
export function rolesFromChips(profile: Profile, next: readonly string[]): ProfilePatch | null {
  const wasAny = hasNoRolePreference(profile);
  const nowAny = next.includes(NO_ROLE_PREFERENCE);
  let roles: RoleId[];
  if (!wasAny && nowAny) roles = [...allRoles];
  else if (wasAny && nowAny) roles = expand(next.filter((role) => role !== NO_ROLE_PREFERENCE));
  else roles = expand(next);
  if (roles.length === 0) return null;
  return { roles, primary_role: roles[0] };
}

export const parseList = (value: string) => [...new Set(value.split(",").map((item) => item.trim()).filter(Boolean))];

export const resetProfile = (profile: Profile): Profile => ({
  ...normalizeSearchProfile(DEFAULT_SEARCH_PROFILE),
  // Reset changes what you search for, not your alerts or setup state.
  notifications_enabled: profile.notifications_enabled,
  onboarding_version: profile.onboarding_version,
  onboarding_completed_at: profile.onboarding_completed_at,
});

/** "All career stages · 4 roles · Anywhere in the US", as on You. */
export function profileSummary(profile: Profile): string {
  const roleCount = new Set(profile.roles.map((role) => (role === "forward_deployed" ? "software_engineering" : role))).size;
  const roles = hasNoRolePreference(profile) ? "Any role" : `${roleCount} ${roleCount === 1 ? "role" : "roles"}`;
  const stages = CAREER_STAGE_OPTIONS.filter((option) => profile.target_levels.includes(option.id));
  const stage = stages.length === CAREER_STAGE_OPTIONS.length ? "All career stages" : stages.map((option) => option.label).join(" + ");
  const metros = LOCATION_OPTIONS.filter((option) => profile.location_ids.includes(option.id));
  const location = hasNoLocationPreference(profile) ? "Anywhere in the US"
    : metros.length === 1 ? metros[0].label : `${metros[0]?.label ?? "Locations"} +${metros.length - 1}`;
  return `${stage} · ${roles} · ${location}`;
}
