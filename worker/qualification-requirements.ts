import {
  educationRank,
  profileExperienceCeiling,
  type EducationLevel,
  type SearchProfile,
} from "../shared/search-profile";

export interface QualificationPath {
  education: EducationLevel | null;
  min_years: number | null;
  max_years: number | null;
}

/** Every group is required; any complete path within a group can satisfy it. */
export interface QualificationRequirements {
  groups: QualificationPath[][];
  experience_specified: boolean;
}

export interface QualificationClause {
  text: string;
  section: "required" | "preferred" | "unknown";
}

const DEGREE = /\b(high[- ]school|ged|associate(?:['’]?s)?(?: degree)?|bachelor(?:['’]?s)?(?: degree)?|bs|ba|bsc|beng|master(?:['’]?s)?(?: degree)?|ms|ma|msc|meng|mba|phd|dphil|doctorate|doctoral degree)\b/g;

function degrees(text: string): EducationLevel[] {
  return [...text.matchAll(DEGREE)].map((match) => {
    const word = match[1];
    if (/^(high[- ]school|ged)/.test(word)) return "high_school";
    if (word.startsWith("associate")) return "associate";
    if (/^(bachelor|bs|ba|bsc|beng)$/.test(word) || word.startsWith("bachelor")) return "bachelor";
    if (/^(master|ms|ma|msc|meng|mba)/.test(word)) return "master";
    return "doctorate";
  });
}

function optional(text: string): boolean {
  return /\b(?:preferred|ideally|nice[- ]to[- ]have|bonus|a plus|desirable|optional|not required)\b/.test(text);
}

function degreeRequirement(text: string, section: QualificationClause["section"]): boolean {
  if (/\b(?:pursuing|enrolled|working toward|currently studying|students?|candidates?)\b/.test(text)) return false;
  if (/\b(?:no degree|degree (?:is )?not required|degrees? (?:are )?not required)\b/.test(text)) return false;
  if (/\b(?:team of|work with|collaborat\w* with|founded by|mentor\w*|supervis\w*)\b/.test(text)) return false;
  return section === "required"
    || /\b(?:required|requires?|must|minimum|you have|you hold|employer (?:will )?accepts?)\b/.test(text)
    || /^(?:an? )?(?:bachelor|master|associate|bs\b|ba\b|ms\b|phd\b|doctorate|high school)/.test(text);
}

/** Recognized OR branches need qualification evidence on both sides. This keeps
 * "computer science or engineering" together while splitting degree pathways. */
function alternativeBranches(text: string): string[] {
  const parts = text.split(/\s+or\s+|\s*\/\s*(?=(?:bs|ba|ms|ma|phd|bachelor|master)\b)/);
  const branches: string[] = [];
  const evidence = (part: string) => degrees(part).length > 0
    || /^(?:(?:at least|minimum(?: of)?|have|possess|with)\s+)?\d{1,2}\s*\+?\s*(?:years?|yrs?|yoe)\b|^(?:(?:an? |have )?)equivalent (?:practical |professional |work )?experience\b/.test(part.trim());
  for (const part of parts) {
    if (branches.length === 0 || evidence(part)) branches.push(part);
    else branches[branches.length - 1] += ` or ${part}`;
  }
  return branches.length > 1 && branches.every(evidence) ? branches : [text];
}

export function extractQualificationRequirements(
  clauses: QualificationClause[],
  parseYears: (text: string) => { min: number | null; max: number | null },
): QualificationRequirements {
  const groups: QualificationPath[][] = [];
  let experienceSpecified = false;
  for (const { text: original, section } of clauses) {
    if (section === "preferred") continue;
    // Keep a mandatory base before an inline preference, but ignore figures
    // whose own clause marks them as optional ("3 years preferred").
    const text = original.replace(/\([^)]*\b(?:preferred|a plus|optional)\b[^)]*\)/g, " ")
      .split(/,?\s*\b(?:ideally|nice[- ]to[- ]have|bonus|a plus)\b/, 1)[0]
      .split(/,\s*/).filter((part) => !optional(part)).join(", ");
    if (optional(text)) continue;
    const branches = alternativeBranches(text);
    const educationRequired = degrees(text).length > 0 && (degreeRequirement(text, section)
      || branches.length > 1 && branches.some((branch) => parseYears(branch).min !== null));
    const paths = branches.map((branch): QualificationPath => {
      const years = parseYears(branch);
      // A bare number on a degree route ("BS + 4 years") is a requirement.
      const routeYears = branch.match(/\b(\d{1,2})\s*(?:\+|(?:-|to)\s*(\d{1,2}))?\s*(?:years?|yrs?|yoe)\b/);
      const min = years.min ?? (educationRequired && routeYears ? Number(routeYears[1]) : null);
      const levels = educationRequired ? degrees(branch) : [];
      return {
        education: levels.length > 0 ? levels.reduce((a, b) =>
          branches.length > 1
            ? educationRank(a) < educationRank(b) ? a : b
            : educationRank(a) > educationRank(b) ? a : b) : null,
        min_years: min,
        max_years: years.max ?? (routeYears?.[2] ? Number(routeYears[2]) : null),
      };
    });
    // "BS/MS + 2 years" shares the trailing years across its degree list.
    // A later experience-only OR branch remains a separate complete route.
    for (let index = paths.length - 2; index >= 0; index--) {
      const path = paths[index], next = paths[index + 1];
      if (path.education !== null && path.min_years === null
        && next.education !== null && next.min_years !== null) {
        path.min_years = next.min_years;
        path.max_years = next.max_years;
      }
    }
    // "7 years in security or equivalent experience" changes the kind of
    // experience, not the number. An unquantified equivalent route cannot
    // silently erase the stated numeric minimum.
    for (let index = 1; index < paths.length; index++) {
      const path = paths[index], previous = paths[index - 1];
      if (path.education === null && path.min_years === null
        && previous.education === null && previous.min_years !== null
        && /^equivalent\b/.test(branches[index].trim())) {
        path.min_years = previous.min_years;
        path.max_years = previous.max_years;
      }
    }
    if (paths.some((path) => path.min_years !== null)) experienceSpecified = true;
    if (paths.some((path) => path.education !== null || path.min_years !== null)) {
      const previous = groups.at(-1);
      if (/^(?:in the alternative|alternatively|or)\b/.test(text)
        && previous?.some((path) => path.education !== null)) {
        previous.push(...paths);
      } else groups.push(paths);
    }
    // A trailing ", with 5 years" applies to the qualification as a whole,
    // including the degree route before an equivalent-experience alternative.
    const sharedYears = text.match(/,\s*(?:with|plus|and)\s+(\d{1,2}\b[^;]*)/);
    if (sharedYears) {
      const years = parseYears(sharedYears[1]);
      if (years.min !== null) {
        groups.push([{ education: null, min_years: years.min, max_years: years.max }]);
        experienceSpecified = true;
      }
    }
  }
  return { groups, experience_specified: experienceSpecified };
}

/** Catalog scope considers the easiest non-doctoral route; user matching later
 * enforces the degree associated with that route. Independent bullets add up
 * as requirements, so their strictest minimum still wins. */
export function minimumNonDoctoralExperience(requirements: QualificationRequirements) {
  const selected = requirements.groups.map((group) => {
    const paths = group.filter((path) => path.education !== "doctorate");
    if (paths.length === 0 || paths.some((path) => path.min_years === null)) return null;
    return paths.reduce((a, b) => (a.min_years ?? 0) < (b.min_years ?? 0) ? a : b);
  }).filter((path): path is QualificationPath => path !== null);
  if (selected.length === 0) return null;
  return selected.reduce((a, b) => (a.min_years ?? 0) > (b.min_years ?? 0) ? a : b);
}

export function qualificationsEligible(
  requirements: QualificationRequirements,
  profile: SearchProfile,
  fallbackMinYears: number | null,
): boolean {
  const ceiling = profileExperienceCeiling(profile);
  if (!requirements.experience_specified && fallbackMinYears === null && !profile.include_unspecified_experience) return false;
  if (requirements.groups.length === 0) return fallbackMinYears === null || fallbackMinYears <= ceiling;
  return requirements.groups.every((group) => group.some((path) => {
    if (path.education === "doctorate") return false; // Current early-career catalog policy.
    if (path.education !== null && profile.highest_education !== "unspecified"
      && educationRank(profile.highest_education) < educationRank(path.education)) return false;
    return path.min_years === null || path.min_years <= ceiling;
  })) && (requirements.experience_specified || fallbackMinYears === null || fallbackMinYears <= ceiling);
}

export function parseStoredQualifications(value: string | null | undefined): QualificationRequirements | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as QualificationRequirements;
    const levels = new Set([null, "none", "high_school", "associate", "bachelor", "master", "doctorate"]);
    const years = (value: unknown) => value === null || typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 99;
    if (typeof parsed.experience_specified !== "boolean" || !Array.isArray(parsed.groups)
      || !parsed.groups.every((group) => Array.isArray(group) && group.length > 0 && group.every((path) =>
        path && levels.has(path.education) && years(path.min_years) && years(path.max_years)))) return null;
    return parsed;
  } catch { return null; }
}
