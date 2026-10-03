export const SEARCH_PROFILE_VERSION = 5 as const;
export const ONBOARDING_VERSION = 3 as const;

export const ROLE_OPTIONS = [
  {
    id: "software_engineering",
    family: "engineering",
    label: "SWE",
    shortLabel: "SWE",
    keywords: ["software engineer", "software developer", "product engineer", "forward deployed engineer", "member of technical staff", "founding engineer", "swe"],
    departments: ["engineering", "technology", "development"],
  },
  {
    id: "forward_deployed",
    family: "engineering",
    label: "FDE",
    shortLabel: "FDE",
    keywords: [
      "forward deployed engineer",
      "forward-deployed engineer",
      "forward deployment engineer",
      "forward deployed software engineer",
      "forward-deployed software engineer",
      "forward deployment software engineer",
    ],
    departments: ["engineering", "forward deployed"],
  },
  {
    id: "frontend",
    family: "engineering",
    label: "Frontend",
    shortLabel: "Frontend",
    keywords: ["frontend", "front end", "front-end", "web engineer", "ui engineer"],
    departments: ["engineering", "web"],
  },
  {
    id: "backend",
    family: "engineering",
    label: "Backend",
    shortLabel: "Backend",
    keywords: ["backend", "back end", "back-end", "server engineer", "api engineer"],
    departments: ["engineering", "platform"],
  },
  {
    id: "full_stack",
    family: "engineering",
    label: "Fullstack",
    shortLabel: "Fullstack",
    keywords: ["fullstack", "full stack", "full-stack"],
    departments: ["engineering", "product"],
  },
  {
    id: "mobile",
    family: "engineering",
    label: "Mobile",
    shortLabel: "Mobile",
    keywords: ["mobile engineer", "ios engineer", "android engineer", "react native"],
    departments: ["engineering", "mobile"],
  },
  {
    id: "data_engineering",
    family: "data_ai",
    label: "Data",
    shortLabel: "Data",
    keywords: ["data engineer", "analytics engineer", "data platform engineer"],
    departments: ["data", "engineering", "analytics"],
  },
  {
    id: "machine_learning",
    family: "data_ai",
    label: "AI / ML",
    shortLabel: "AI / ML",
    keywords: ["machine learning engineer", "ml engineer", "ai engineer", "data scientist"],
    departments: ["machine learning", "ml", "ai", "data"],
  },
  {
    id: "research",
    family: "data_ai",
    label: "Research",
    shortLabel: "Research",
    keywords: ["research", "research engineer", "research scientist", "researcher", "applied scientist"],
    departments: ["research"],
  },
  {
    id: "infrastructure",
    family: "engineering",
    label: "Infrastructure & SRE",
    shortLabel: "Infra / SRE",
    keywords: ["infrastructure engineer", "platform engineer", "site reliability engineer", "sre", "devops engineer", "cloud engineer", "developer productivity engineer"],
    departments: ["infrastructure", "platform", "engineering", "cloud"],
  },
  {
    id: "security",
    family: "security",
    label: "Security",
    shortLabel: "Security",
    keywords: ["security engineer", "application security", "product security", "security researcher"],
    departments: ["security", "engineering"],
  },
] as const;

export type RoleId = (typeof ROLE_OPTIONS)[number]["id"];
export type RoleFamily = (typeof ROLE_OPTIONS)[number]["family"] | "other";

/**
 * A specific title signal wins over the generic SWE label. For example,
 * "Frontend Software Engineer" is a frontend role, not an escape hatch that
 * lets a deselected frontend specialty back into a general SWE feed.
 */
export function specificRoleSpecialties(specialties: readonly RoleId[]): RoleId[] {
  const unique = [...new Set(specialties)];
  const specific = unique.filter((specialty) => specialty !== "software_engineering");
  return specific.length > 0 ? specific : unique;
}

export const CAREER_STAGE_OPTIONS = [
  {
    id: "internship",
    label: "Internships",
    detail: "Internships, co-ops, and apprenticeships",
    minYears: 0,
    maxYears: 0,
  },
  {
    id: "new_grad",
    label: "New grad",
    detail: "Graduate and entry-level roles",
    minYears: 0,
    maxYears: 0,
  },
  {
    id: "early_career",
    label: "Early career (1–3 years)",
    detail: "Roles asking for one to three years",
    minYears: 1,
    maxYears: 3,
  },
] as const;

export type CareerStage = (typeof CAREER_STAGE_OPTIONS)[number]["id"];

/** @deprecated Use CAREER_STAGE_OPTIONS. Kept while older clients roll forward. */
export const EXPERIENCE_OPTIONS = CAREER_STAGE_OPTIONS;
/** @deprecated Use CareerStage. Kept while older clients roll forward. */
export type ExperienceLevel = CareerStage;
export type StretchTolerance = "strict" | "balanced" | "ambitious";

// Pinkslip's public catalog stops at roughly three years. Career stage narrows
// within that fixed ceiling; it cannot widen the feed to senior or staff roles.

/** Highest stated years-of-experience requirement still considered a match. */
export const MAX_YEARS_EXPERIENCE = 3;

/** Seniorities kept in the feed after the current classifier has run. */
export const ELIGIBLE_SENIORITIES = CAREER_STAGE_OPTIONS.map(
  (option) => option.id
) as CareerStage[];

export type EligibleSeniority = (typeof ELIGIBLE_SENIORITIES)[number];

export function isEligibleSeniority(seniority: string): boolean {
  return (ELIGIBLE_SENIORITIES as readonly string[]).includes(seniority);
}
export type WorkMode = "remote" | "hybrid" | "onsite";
export type WorkAuthorization = "authorized" | "sponsorship" | "not_sure";

export const EDUCATION_OPTIONS = [
  { id: "unspecified", label: "No education filter" },
  { id: "none", label: "No completed degree" },
  { id: "high_school", label: "High school / GED" },
  { id: "associate", label: "Associate degree" },
  { id: "bachelor", label: "Bachelor’s degree" },
  { id: "master", label: "Master’s degree" },
  { id: "doctorate", label: "Doctorate" },
] as const;
export type EducationLevel = Exclude<(typeof EDUCATION_OPTIONS)[number]["id"], "unspecified">;
export type EducationPreference = (typeof EDUCATION_OPTIONS)[number]["id"];

export function educationRank(level: EducationLevel): number {
  return EDUCATION_OPTIONS.findIndex((option) => option.id === level);
}

export function profileExperienceCeiling(profile: SearchProfile): number {
  return Math.min(MAX_YEARS_EXPERIENCE, profile.max_required_years ?? profile.years_experience);
}

export const LOCATION_OPTIONS = [
  { id: "sf_bay", label: "San Francisco / Bay Area", aliases: ["san francisco", "bay area", "palo alto", "mountain view", "sunnyvale", "san jose", "menlo park", "redwood city", "los gatos", "cupertino", "san mateo", "foster city", "south san francisco"] },
  { id: "new_york", label: "New York, NY", aliases: ["new york", "nyc", "brooklyn", "jersey city"] },
  { id: "chicago", label: "Chicago, IL", aliases: ["chicago"] },
  { id: "boston", label: "Boston, MA", aliases: ["boston", "cambridge"] },
  { id: "washington_dc", label: "Washington, DC", aliases: ["washington, dc", "washington dc", "washington d.c.", "arlington", "mclean"] },
  { id: "seattle", label: "Seattle, WA", aliases: ["seattle", "bellevue", "redmond"] },
  { id: "austin", label: "Austin, TX", aliases: ["austin"] },
  { id: "los_angeles", label: "Los Angeles, CA", aliases: ["los angeles", "santa monica", "culver city", "el segundo", "pasadena", "burbank"] },
  { id: "denver", label: "Denver, CO", aliases: ["denver", "boulder"] },
  { id: "atlanta", label: "Atlanta, GA", aliases: ["atlanta"] },
] as const;

export type LocationId = (typeof LOCATION_OPTIONS)[number]["id"];

export interface SearchProfile {
  version: typeof SEARCH_PROFILE_VERSION;
  primary_role: RoleId;
  roles: RoleId[];
  years_experience: number;
  highest_education: EducationPreference;
  /** null follows the user's experience; a number permits an explicit stretch. */
  max_required_years: number | null;
  include_unspecified_experience: boolean;
  target_levels: CareerStage[];
  stretch_tolerance: StretchTolerance;
  countries: string[];
  location_ids: LocationId[];
  custom_locations: string[];
  work_modes: WorkMode[];
  relocation_willing: boolean;
  work_authorization: WorkAuthorization;
  custom_titles: string[];
  excluded_titles: string[];
  notifications_enabled: boolean;
  onboarding_version: number;
  onboarding_completed_at: string | null;
}

export type SearchProfileV1 = SearchProfile;

export const DEFAULT_SEARCH_PROFILE: SearchProfile = {
  version: SEARCH_PROFILE_VERSION,
  primary_role: "software_engineering",
  // FDE used to be classified as generic SWE. Keeping it in the default
  // stored selection preserves that eligibility while iOS exposes it as an
  // independently removable chip.
  roles: ["software_engineering", "forward_deployed", "frontend", "backend", "full_stack"],
  years_experience: 1,
  highest_education: "unspecified",
  max_required_years: MAX_YEARS_EXPERIENCE,
  include_unspecified_experience: true,
  target_levels: CAREER_STAGE_OPTIONS.map((option) => option.id),
  stretch_tolerance: "balanced",
  countries: ["US"],
  location_ids: ["sf_bay", "new_york", "chicago", "boston", "washington_dc", "seattle", "austin"],
  custom_locations: [],
  work_modes: ["remote", "hybrid", "onsite"],
  relocation_willing: false,
  work_authorization: "authorized",
  custom_titles: [],
  excluded_titles: [],
  notifications_enabled: false,
  onboarding_version: 0,
  onboarding_completed_at: null,
};

const ROLE_IDS = new Set<string>(ROLE_OPTIONS.map((option) => option.id));
const CAREER_STAGE_IDS = new Set<string>(CAREER_STAGE_OPTIONS.map((option) => option.id));
const LOCATION_IDS = new Set<string>(LOCATION_OPTIONS.map((option) => option.id));
const WORK_MODES = new Set<string>(["remote", "hybrid", "onsite"]);
const STRETCH_OPTIONS = new Set<string>(["strict", "balanced", "ambitious"]);
const AUTH_OPTIONS = new Set<string>(["authorized", "sponsorship", "not_sure"]);

function stringList(value: unknown, maxItems: number): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean))].slice(0, maxItems);
}

function numberInRange(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, Math.round(parsed))) : fallback;
}

function levelFromLegacy(value: unknown): CareerStage {
  return typeof value === "string" && CAREER_STAGE_IDS.has(value)
    ? value as CareerStage
    : DEFAULT_SEARCH_PROFILE.target_levels[0];
}

export function normalizeSearchProfile(value: unknown): SearchProfile {
  const input = value && typeof value === "object"
    ? value as Record<string, unknown>
    : {};
  const roles = stringList(input.roles, ROLE_OPTIONS.length).filter((role): role is RoleId => ROLE_IDS.has(role));
  const sourceVersion = typeof input.version === "number" ? input.version : 0;
  const migratedRoles = sourceVersion < 4
    && roles.includes("software_engineering")
    && !roles.includes("forward_deployed")
      ? [
          ...roles.slice(0, roles.indexOf("software_engineering") + 1),
          "forward_deployed" as const,
          ...roles.slice(roles.indexOf("software_engineering") + 1),
        ]
      : roles;
  const selectedRoles = migratedRoles.length > 0 ? migratedRoles : [...DEFAULT_SEARCH_PROFILE.roles];
  const legacyLevel = levelFromLegacy(input.experience_level);
  const requestedStages = stringList(input.target_levels, CAREER_STAGE_OPTIONS.length)
    .filter((level): level is CareerStage => CAREER_STAGE_IDS.has(level));
  // v4 intentionally resets the former six-level preference to the complete
  // three-stage catalog. Existing users confirm that migrated selection in
  // onboarding v3 before internship matches or alerts are allowed through.
  const targetStages = sourceVersion < 4
    ? CAREER_STAGE_OPTIONS.map((option) => option.id)
    : requestedStages;
  const legacyRemote = input.remote === true;
  const workModes = stringList(input.work_modes, 3).filter((mode): mode is WorkMode => WORK_MODES.has(mode));
  const locationIds = stringList(input.location_ids, LOCATION_OPTIONS.length)
    .filter((location): location is LocationId => LOCATION_IDS.has(location));

  return {
    version: SEARCH_PROFILE_VERSION,
    // Kept in the stored shape for backward compatibility with the ranking
    // pipeline. The product no longer asks users to designate a primary role;
    // selection order is the single internal source of truth.
    primary_role: selectedRoles[0],
    roles: selectedRoles,
    years_experience: numberInRange(
      input.years_experience,
      CAREER_STAGE_OPTIONS.find((option) => option.id === legacyLevel)?.maxYears ?? DEFAULT_SEARCH_PROFILE.years_experience,
      0,
      40
    ),
    highest_education: EDUCATION_OPTIONS.some((option) => option.id === input.highest_education)
      ? input.highest_education as EducationPreference
      : "unspecified",
    max_required_years: input.max_required_years === null
      ? null
      : typeof input.max_required_years === "number" && Number.isFinite(input.max_required_years)
        ? numberInRange(input.max_required_years, MAX_YEARS_EXPERIENCE, 0, MAX_YEARS_EXPERIENCE)
        : MAX_YEARS_EXPERIENCE,
    include_unspecified_experience: typeof input.include_unspecified_experience === "boolean"
      ? input.include_unspecified_experience
      : true,
    target_levels: targetStages.length > 0
      ? targetStages
      : CAREER_STAGE_OPTIONS.map((option) => option.id),
    stretch_tolerance: typeof input.stretch_tolerance === "string" && STRETCH_OPTIONS.has(input.stretch_tolerance)
      ? input.stretch_tolerance as StretchTolerance
      : DEFAULT_SEARCH_PROFILE.stretch_tolerance,
    countries: stringList(input.countries, 12).length > 0 ? stringList(input.countries, 12) : ["US"],
    location_ids: locationIds,
    custom_locations: stringList(input.custom_locations, 12),
    work_modes: workModes.length > 0 ? workModes : legacyRemote ? ["remote", "hybrid", "onsite"] : [...DEFAULT_SEARCH_PROFILE.work_modes],
    relocation_willing: typeof input.relocation_willing === "boolean" ? input.relocation_willing : false,
    work_authorization: typeof input.work_authorization === "string" && AUTH_OPTIONS.has(input.work_authorization)
      ? input.work_authorization as WorkAuthorization
      : DEFAULT_SEARCH_PROFILE.work_authorization,
    custom_titles: stringList(input.custom_titles, 12),
    excluded_titles: stringList(input.excluded_titles, 20),
    notifications_enabled: typeof input.notifications_enabled === "boolean" ? input.notifications_enabled : false,
    onboarding_version: numberInRange(input.onboarding_version, 0, 0, ONBOARDING_VERSION),
    onboarding_completed_at: typeof input.onboarding_completed_at === "string" ? input.onboarding_completed_at : null,
  };
}

export function profileRoleKeywords(profile: SearchProfile): string[] {
  const selected = new Set(profile.roles);
  return [
    ...ROLE_OPTIONS.filter((option) => selected.has(option.id)).flatMap((option) => [...option.keywords]),
    ...profile.custom_titles,
  ];
}

export function profileDepartmentKeywords(profile: SearchProfile): string[] {
  const selected = new Set(profile.roles);
  return [...new Set(ROLE_OPTIONS.filter((option) => selected.has(option.id)).flatMap((option) => [...option.departments]))];
}

export function profileLocationAliases(profile: SearchProfile): string[] {
  const selected = new Set(profile.location_ids);
  return [
    ...(profile.work_modes.includes("remote") ? ["remote"] : []),
    ...LOCATION_OPTIONS.filter((option) => selected.has(option.id)).flatMap((option) => [...option.aliases]),
    ...profile.custom_locations.map((location) => location.toLowerCase()),
  ];
}

export function profileExperienceRange(profile: SearchProfile) {
  const levels = CAREER_STAGE_OPTIONS.filter((option) => profile.target_levels.includes(option.id));
  return {
    minYears: levels.length > 0 ? Math.min(...levels.map((level) => level.minYears)) : 0,
    maxYears: levels.length > 0 ? Math.max(...levels.map((level) => level.maxYears)) : profile.years_experience,
  };
}

/**
 * The stored v4 profile can contain internships before an existing user has
 * confirmed the new onboarding question. Matching and alerts must use this
 * effective view so an internship never arrives as a surprise during rollout.
 */
export function effectiveTargetStages(profile: SearchProfile): CareerStage[] {
  if (
    profile.onboarding_version >= ONBOARDING_VERSION
    && profile.onboarding_completed_at !== null
  ) {
    return [...profile.target_levels];
  }
  return ["new_grad", "early_career"];
}

export function roleLabel(roleId: RoleId): string {
  return ROLE_OPTIONS.find((role) => role.id === roleId)?.shortLabel ?? roleId;
}
