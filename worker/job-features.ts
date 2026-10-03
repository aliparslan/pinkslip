import {
  isEligibleSeniority,
  LOCATION_OPTIONS,
  MAX_YEARS_EXPERIENCE,
  ROLE_OPTIONS,
  specificRoleSpecialties,
  type CareerStage,
  type LocationId,
  type RoleFamily,
  type RoleId,
  type WorkMode,
} from "../shared/search-profile";
import type { JobListing } from "./adapters/types";
import {
  extractQualificationRequirements,
  minimumNonDoctoralExperience,
  parseStoredQualifications,
  type QualificationRequirements,
} from "./qualification-requirements";

// Bump whenever classification, hard-requirement, or review semantics change.
// Stored rows are versioned so the poller can drain a bounded, self-healing
// reclassification instead of mixing old and new policy.
export const JOB_CLASSIFIER_VERSION = "deterministic-v23-education-experience";

export type ClassifiedSeniority = CareerStage
  | "mid_level"
  | "senior"
  | "staff_plus"
  | "manager"
  | "executive"
  | "unknown";

export type JobReviewReason =
  | "ambiguous_title_level"
  | "experience_requirement_unparsed"
  | "advanced_degree_uncertain";

export interface JobFeatures {
  role_family: RoleFamily;
  specialties: RoleId[];
  seniority: ClassifiedSeniority;
  min_years: number | null;
  max_years: number | null;
  work_mode: WorkMode | "unknown";
  countries: string[];
  metro_areas: LocationId[];
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string | null;
  salary_period: "year" | "hour" | null;
  sponsorship_available: boolean | null;
  requires_advanced_degree: boolean;
  requires_security_clearance: boolean;
  qualification_requirements?: QualificationRequirements;
  classifier_version: string;
  confidence: number;
}

export interface StoredJobFeatureColumns {
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
  requires_security_clearance: number | null;
  qualification_requirements_json?: string | null;
  classifier_version: string;
  confidence: number;
}

function parseJsonList<T extends string>(value: string): T[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is T => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

export function storedJobFeaturesFromRow(row: StoredJobFeatureColumns): JobFeatures {
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
    requires_security_clearance: row.requires_security_clearance === 1,
    qualification_requirements: parseStoredQualifications(row.qualification_requirements_json) ?? undefined,
    classifier_version: row.classifier_version,
    confidence: row.confidence,
  };
}

export interface FeatureJobRow {
  id: string;
  external_id: string;
  title: string;
  url: string;
  location: string;
  department: string | null;
  posted_at: string | null;
  first_seen_at: string;
  description: string | null;
  salary: string | null;
}

function containsPhrase(text: string, phrase: string): boolean {
  if (phrase.includes(" ")) return text.includes(phrase);
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}\\b`, "i").test(text);
}

const NUMBER_WORDS: Record<string, string> = {
  zero: "0",
  one: "1",
  two: "2",
  three: "3",
  four: "4",
  five: "5",
  six: "6",
  seven: "7",
  eight: "8",
  nine: "9",
  ten: "10",
};

function normalizeClassifierText(
  value: string,
  preserveBlockBoundaries = false
): string {
  let normalized = value
    .normalize("NFKC")
    // Some ATS payloads contain escaped HTML inside an already-HTML field.
    // Decode entities before stripping tags so markup does not separate words
    // that belong to the same qualification clause.
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&(?:quot|#34);/gi, "\"")
    .replace(/&(?:apos|#39|#x0*27);/gi, "'");
  if (preserveBlockBoundaries) {
    normalized = normalized.replace(/\r?\n/g, "; ").replace(
      /<\/?(?:li|p|div|h[1-6]|ul|ol)\b[^>]*>|<br\s*\/?\s*>/gi,
      "; "
    );
  }
  return normalized
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&(?:plus|#43|#x0*2b);/gi, "+")
    .replace(/[‐‑‒–—]/g, "-")
    .replace(/\b(?:zero|one|two|three|four|five|six|seven|eight|nine|ten)\b/gi, (word) => NUMBER_WORDS[word.toLowerCase()] ?? word)
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function requiredExperienceText(text: string): string {
  return text
    // Company history is not candidate experience. Tower's internship copy,
    // for example, says "we have a 25+ year track record of innovation";
    // treating that as a 25-year applicant requirement silently removed an
    // otherwise valid internship.
    .replace(
      /\b(?:we|the company|the organization|our (?:company|organization|team))\s+(?:have|has|brings|boasts)\s+(?:a\s+)?\d{1,2}\s*\+\s*years?\s+(?:track record|history)\b[^.;|]*/g,
      " "
    )
    .replace(/\b(?:preferred|ideally|nice to have|bonus|a plus|desirable)\b[^.;|]*/g, " ")
    // A trailing preference normally scopes the number itself ("7 years
    // preferred"). Preserve an explicitly mandatory base such as "at least 2
    // years, ideally including 1 year on dbt Platform".
    .replace(
      /(?<!at least )(?<!minimum )(?<!minimum of )\b\d{1,2}\s*(?:\+|\s*-\s*\d{1,2})?\s*(?:years?|yrs?|yoe)[^.;|]{0,45}\b(?:preferred|ideal|a plus|nice to have|bonus|desirable)\b/g,
      " "
    );
}

function structuredMandatoryMinimums(title: string, description: string | null): number[] {
  const clauses = normalizeClassifierText(
    `${title}\n${description ?? ""}`,
    true
  ).split(/[.;|]+/);
  let optionalSection = false;
  const minimums: number[] = [];

  for (const rawClause of clauses) {
    const clause = rawClause.trim();
    if (!clause) continue;
    if (/^(?:preferred(?: skills(?:\s*(?:and|&)\s*experience)?| qualifications?)?|nice to have|bonus|desirable)\b/.test(clause)) {
      optionalSection = true;
      continue;
    }
    if (/^(?:required|minimum|basic|must-have) qualifications?\b|^(?:what (?:you(?:'ll)? need|we(?:'re| are) looking for)|who you are|you are a good fit if)\b/.test(clause)) {
      optionalSection = false;
    }
    if (optionalSection) continue;
    const mandatoryClause = clause.split(
      /\b(?:preferred|ideally|nice to have|bonus|a plus|desirable)\b/,
      1
    )[0];
    for (const match of mandatoryClause.matchAll(/\b(?:minimum(?: of)?|at least)\s+(\d{1,2})\s*\+?\s*(?:years?|yrs?|yoe)\b/g)) {
      const minimum = Number(match[1]);
      if (Number.isFinite(minimum)) minimums.push(minimum);
    }
  }

  return minimums;
}

function parseLegacyExperienceRequirement(
  title: string,
  description: string | null,
  allowImpliedExperience = true,
): { min: number | null; max: number | null } {
  const text = normalizeClassifierText(`${title}\n${description ?? ""}`);
  // Preference-only figures must never raise the eligibility ceiling. Remove
  // both "preferred: 7+ years" and "7+ years preferred" before collecting
  // mandatory requirements.
  const requiredText = requiredExperienceText(text);
  const candidates: Array<{ min: number; max: number | null }> = [];
  const rangeSpans: Array<{ start: number; end: number }> = [];
  const collect = (source: string, pattern: RegExp, maxGroup?: number) => {
    for (const match of source.matchAll(pattern)) {
      const start = match.index ?? 0;
      if (!maxGroup && rangeSpans.some((span) => start >= span.start && start < span.end)) continue;
      if (maxGroup) rangeSpans.push({ start, end: start + match[0].length });
      const min = Number(match[1]);
      const max = maxGroup ? Number(match[maxGroup]) : null;
      if (Number.isFinite(min)) {
        candidates.push({ min, max: max !== null && Number.isFinite(max) ? max : null });
      }
    }
  };
  // Explicit range, e.g. "3-5 years" — but not "3-5 years ago".
  collect(requiredText, /\b(\d{1,2})\s*(?:-|–|to)\s*(\d{1,2})\s*(?:\+?\s*)?(?:years?|yrs?|yoe)\b(?!\s*ago)/g, 2);
  // A bare "N years" elsewhere in the description ("founded 3 years ago",
  // "10 years of free snacks") is not an experience requirement. Require a
  // requirement cue: an explicit qualifier ("at least/minimum N years", "N+
  // years") or an experience-context phrase ("N years of experience").
  collect(requiredText, /\b(?:at least|minimum of|minimum|min\.?|requires?|require)\s+(\d{1,2})\s*\+?\s*(?:years?|yrs?|yoe)\b/g);
  collect(requiredText, /\b(\d{1,2})\s*\+\s*(?:years?|yrs?|yoe)\b(?!\s*ago)/g);
  collect(requiredText, /\b(\d{1,2})\s*\+?\s*(?:years?|yrs?|yoe)\s+(?:of\s+)?(?:(?:relevant|professional|industry|related|work|hands-on|progressive|post-baccalaureate)[\s,-]+){0,3}experience\b/g);
  collect(requiredText, /\b(\d{1,2})\s*\+?\s*(?:years?|yrs?|yoe)\s+(?:of\s+)?(?:building|developing|designing|engineering|programming|working)\b/g);
  // HTML list boundaries distinguish "PhD strongly preferred" from the next
  // mandatory list item, "Minimum 5 years". The flat-text preference scrubber
  // intentionally cannot recover that distinction.
  for (const minimum of structuredMandatoryMinimums(title, description)) {
    candidates.push({ min: minimum, max: null });
  }
  if (candidates.length > 0) {
    // If a posting lists multiple mandatory requirements, the strictest minimum
    // is the one that determines whether an early-career applicant qualifies.
    return candidates.sort((a, b) => b.min - a.min)[0];
  }
  if (!allowImpliedExperience) return { min: null, max: null };
  // A title is authoritative for internships. Body copy must use one of the
  // narrow role-defining shapes in hasExplicitInternshipSignal; merely
  // mentioning the company's internship program is not enough.
  if (/\b(?:interns?|internships?|co-?ops?|apprentices?|apprenticeships?)\b/.test(title.toLowerCase())) {
    return { min: 0, max: 0 };
  }
  if (hasExplicitNewGradSignal(title, description)) {
    return { min: 0, max: 0 };
  }
  if (/\bearly[ -]career\b/.test(text)) {
    return { min: 1, max: 3 };
  }
  return { min: null, max: null };
}

export function parseQualificationRequirements(description: string | null): QualificationRequirements {
  return extractQualificationRequirements(
    qualificationClauses(description ?? ""),
    (text) => parseLegacyExperienceRequirement("", text, false),
  );
}

function experienceFromRequirements(title: string, description: string | null, requirements: QualificationRequirements) {
  const path = minimumNonDoctoralExperience(requirements);
  if (path) return { min: path.min_years, max: path.max_years };
  // No mandatory body years: role-defining signals may still imply zero.
  if (hasExplicitInternshipSignal(title, description) || hasExplicitNewGradSignal(title, description)) {
    return { min: 0, max: 0 };
  }
  return parseLegacyExperienceRequirement(title, null);
}

export function parseExperienceRequirement(title: string, description: string | null) {
  return experienceFromRequirements(title, description, parseQualificationRequirements(description));
}

const DOCTORATE_DEGREE_SOURCE = String.raw`(?:ph\.?\s*d\.?|d\.?\s*phil\.?|doctorate|doctoral(?:\s+degree)?)`;
const ELIGIBLE_DEGREE_SOURCE = String.raw`(?:bachelor(?:[’']?s)?(?:\s+degree)?|b\.?\s*a\.?|b\.?\s*s\.?|b\.?\s*sc\.?|b\.?\s*eng\.?|master(?:[’']?s)?(?:\s+degree)?|m\.?\s*a\.?|m\.?\s*s\.?|m\.?\s*sc\.?|m\.?\s*eng\.?|m\.?\s*b\.?\s*a\.?)`;
const DEGREE_ALTERNATIVE_CONNECTOR_SOURCE = String.raw`(?:\/|\band\/or\b|\bor\b)`;

type QualificationSection = "required" | "preferred" | "unknown";

interface QualificationClause {
  text: string;
  section: QualificationSection;
}

const PREFERRED_QUALIFICATION_HEADING =
  /^(?:preferred(?: skills(?:\s*(?:and|&)\s*experience)?| qualifications?| experience)?|(?:desired|desirable) (?:qualifications?|skills|experience)|ideally\b|nice[- ]to[- ]haves?|bonus qualifications?|what (?:will|would) set you apart|ways? to stand out)\b/;
const REQUIRED_QUALIFICATION_HEADING =
  /^(?:(?:basic|required|minimum|must-have) (?:qualifications?|requirements?|skills|experience)|requirements?|what (?:you(?:'ll)? need|we(?:'re| are) looking for)|who you are|you are a good fit if)\b/;
const NON_QUALIFICATION_HEADING =
  /^(?:about (?:the role|us|you)|responsibilities|what you(?:'ll| will) do|the opportunity|benefits|compensation|equal opportunity|our company|who we are)\b/;

/**
 * Preserve HTML block boundaries and remember whether subsequent bullets live
 * under a required or preferred heading. Flattening headings into spaces made
 * a punctuation-free Basic Qualifications bullet inherit the later Preferred
 * Qualifications marker, which could hide a real hard requirement.
 */
function qualificationClauses(value: string): QualificationClause[] {
  const normalized = normalizeClassifierText(value, true)
    .replace(/\b(?:e\.g\.|i\.e\.)/g, "example")
    // Sentence splitting must not sever a requirement cue from a dotted degree
    // or country abbreviation ("Ph.D. required", "U.S. clearance").
    .replace(/\bph\.\s*d\./g, "phd")
    .replace(/\bd\.\s*phil\.?\b/g, "dphil")
    .replace(/\bb\.\s*a\./g, "ba")
    .replace(/\bb\.\s*s\./g, "bs")
    .replace(/\bb\.\s*sc\./g, "bsc")
    .replace(/\bb\.\s*eng\./g, "beng")
    .replace(/\bm\.\s*b\.\s*a\./g, "mba")
    .replace(/\bm\.\s*a\./g, "ma")
    .replace(/\bm\.\s*s\./g, "ms")
    .replace(/\bm\.\s*sc\./g, "msc")
    .replace(/\bm\.\s*eng\./g, "meng")
    .replace(/\bu\.\s*s\./g, "us");
  const rawClauses = normalized.split(/[.;|]+/);
  const clauses: QualificationClause[] = [];
  let section: QualificationSection = "unknown";

  for (const rawClause of rawClauses) {
    const text = rawClause.trim();
    if (!text) continue;
    if (PREFERRED_QUALIFICATION_HEADING.test(text)) {
      section = "preferred";
    } else if (REQUIRED_QUALIFICATION_HEADING.test(text)) {
      section = "required";
    } else if (NON_QUALIFICATION_HEADING.test(text)) {
      section = "unknown";
    }
    clauses.push({ text, section });
  }
  return clauses;
}

/**
 * A master's is eligible for the current catalog, so a doctorate must not
 * become a gate when the same qualification also accepts a bachelor's or
 * master's. Keep the connector explicit so a separate master's requirement
 * elsewhere in the description cannot hide a doctorate-only requirement.
 */
function hasEligibleDegreeAlternative(clause: string): boolean {
  const eligibleThenDoctorate = new RegExp(
    String.raw`\b${ELIGIBLE_DEGREE_SOURCE}[^.;|]{0,100}?${DEGREE_ALTERNATIVE_CONNECTOR_SOURCE}[^.;|]{0,100}?\b${DOCTORATE_DEGREE_SOURCE}\b`
  );
  const doctorateThenEligible = new RegExp(
    String.raw`\b${DOCTORATE_DEGREE_SOURCE}\b[^.;|]{0,100}?${DEGREE_ALTERNATIVE_CONNECTOR_SOURCE}[^.;|]{0,100}?\b${ELIGIBLE_DEGREE_SOURCE}\b`
  );
  return eligibleThenDoctorate.test(clause) || doctorateThenEligible.test(clause);
}

/**
 * Student postings often describe one inclusive cohort with wording such as
 * "master's and PhD graduates" or "masters and PhD students are also
 * eligible". A bare `and` is too broad for ordinary qualification prose, so
 * keep this exception tied to learner/cohort nouns.
 */
function hasEligibleDegreeCohortAlternative(clause: string): boolean {
  const cohort = String.raw`(?:students?|graduates?|candidates?|applicants?)`;
  const eligibleThenDoctorate = new RegExp(
    String.raw`\b${ELIGIBLE_DEGREE_SOURCE}\b[^.;|]{0,100}?\band\b[^.;|]{0,80}?\b${DOCTORATE_DEGREE_SOURCE}\b[^.;|]{0,45}?\b${cohort}\b`
  );
  const doctorateThenEligible = new RegExp(
    String.raw`\b${DOCTORATE_DEGREE_SOURCE}\b[^.;|]{0,100}?\band\b[^.;|]{0,80}?\b${ELIGIBLE_DEGREE_SOURCE}\b[^.;|]{0,45}?\b${cohort}\b`
  );
  return eligibleThenDoctorate.test(clause) || doctorateThenEligible.test(clause);
}

function hasExperienceAlternativeToDoctorate(clause: string): boolean {
  const experiencePath = String.raw`(?:(?:\d{1,2}\s*\+?\s*(?:years?|yrs?|yoe)(?:\s+of)?\s*)?(?:(?:equivalent|practical|industry|research|relevant|substantial)\s+)*(?:experience|research depth|track record))`;
  const doctorateThenExperience = new RegExp(
    String.raw`\b${DOCTORATE_DEGREE_SOURCE}\b[^.;|]{0,120}?\bor\b[^.;|]{0,100}?(?:have\s+)?${experiencePath}\b`
  );
  const experienceThenDoctorate = new RegExp(
    String.raw`\b${experiencePath}\b[^.;|]{0,120}?\bor\b[^.;|]{0,100}?\b${DOCTORATE_DEGREE_SOURCE}\b`
  );
  // Google's quantified analytics/coding path can include a long list of
  // tools, with or without "experience". Keep it inside the same bullet.
  const quantifiedWorkThenDoctorate = new RegExp(
    String.raw`\b\d{1,2}\s*\+?\s*years?\s+(?:of\s+)?[^.;|]{0,220}?\b(?:coding|querying|statistical analysis|experience)\b[^.;|]{0,160}?\bor\s+(?:an?\s+)?${DOCTORATE_DEGREE_SOURCE}\b`
  );
  return doctorateThenExperience.test(clause)
    || experienceThenDoctorate.test(clause)
    || quantifiedWorkThenDoctorate.test(clause);
}

export function titleRequiresAdvancedDegree(title: string): boolean {
  const text = normalizeClassifierText(title);
  const hasDoctorate = new RegExp(
    String.raw`\b(?:${DOCTORATE_DEGREE_SOURCE}|post-?doctoral)\b`
  ).test(text);
  if (!hasDoctorate) return false;
  if (
    hasEligibleDegreeAlternative(text)
    || hasEligibleDegreeCohortAlternative(text)
    || hasExperienceAlternativeToDoctorate(text)
    || /\b(?:preferred|preferable|optional|a plus|nice to have|bonus)\b/.test(text)
  ) {
    return false;
  }
  return true;
}

function isDoctorateLearnerContext(before: string, after: string): boolean {
  return /\b(?:mentor(?:s|ed|ing)?|teach(?:es|ing|t)?|advis(?:e|es|ed|ing)|supervis(?:e|es|ed|ing)|support(?:s|ed|ing)?)\b[^.;]{0,100}$/.test(before)
    && /^\s+(?:students?|candidates?|fellows?|trainees?)\b/.test(after);
}

function doctorateMentionIsContextual(
  before: string,
  after: string,
  clause: string
): boolean {
  return /^\s+filters?\b/.test(after)
    || /\b(?:collaborat(?:e|es|ing)|work(?:s|ing)? with|team of)\b[^.;]{0,90}$/.test(before)
    || /\b(?:founded|started) by\b[^.;]{0,140}$/.test(before)
    || /\b(?:serve|serves|support|supports|built for|used by|help(?:s|ing)?)\b[^.;]{0,110}$/.test(before)
    || isDoctorateLearnerContext(before, after)
    || /\bno\s+$/.test(before) && /^[^.;]{0,60}\b(?:is\s+)?required\b/.test(after)
    || /^[^.;]{0,90}\b(?:is neither necessary nor sufficient|is not (?:necessary|required)|not required|not necessary)\b/.test(after)
    || /\bph\.?\s?d\.? candidates?\b[^.;]{0,160}\bor independent researchers?\b/.test(clause);
}

/**
 * True when a doctorate is stated as a requirement rather than offered as one
 * acceptable background among several.
 *
 * A master's remains eligible. Preferred doctorates, bachelor/master-or-PhD
 * clauses, and doctorate-or-experience paths are deliberately non-exclusive.
 */
export function requiresAdvancedDegree(description: string | null): boolean {
  if (!description) return false;
  const doctorate = new RegExp(String.raw`\b${DOCTORATE_DEGREE_SOURCE}\b`, "g");

  for (const { text: clause, section } of qualificationClauses(description)) {
    for (const match of clause.matchAll(doctorate)) {
      const start = match.index ?? 0;
      const before = clause.slice(Math.max(0, start - 140), start);
      const after = clause.slice(start + match[0].length, start + match[0].length + 180);
      const optionalMention = section === "preferred"
        || /\b(?:preferred qualifications?|we prefer|ideally|desirable|nice to have|bonus|a plus)\s*:?\s*$/.test(before)
        || /^[^,]{0,100}\b(?:preferred|preferable|a plus|nice to have|bonus|desirable|optional)\b/.test(after);
      // "or equivalent degree" can still mean a doctorate-equivalent degree;
      // only a concrete experience/depth path makes the role eligible.
      const hasAlternative = /^[^.;|]{0,130}\bor equivalent(?: practical| industry| research)? (?:experience|depth|track record)\b/.test(after)
        || hasEligibleDegreeAlternative(clause)
        || hasEligibleDegreeCohortAlternative(clause)
        || hasExperienceAlternativeToDoctorate(clause);
      const positiveRequirement = section === "required"
        || /\bcurrently (?:has|holds),?\s+or\s+is\s+in\s+the\s+process\s+of\s+obtaining\b[^.;|]{0,140}$/.test(before)
        || /\b(?:currently\s+)?(?:pursuing|working\s+towards?|enrolled\s+in|admitted\s+to)\s+(?:an?\s+)?$/.test(before)
        || /\b(?:(?:looking|searching)\s+for|seeking|hiring)\b[^.;|]{0,80}$/.test(before)
        || /^[^.;|]{0,55}\b(?:student|candidate|graduate)\b/.test(after)
        || /\b(?:required|requires?|requirements?|must have|must hold|must possess|minimum qualifications?|qualifications?)\b[^.;|]{0,120}$/.test(before)
        || /^[^.;|]{0,120}\b(?:is\s+)?(?:required|requires?|must have|must hold|must possess|necessary|mandatory|minimum qualifications?)\b/.test(after);

      if (
        !optionalMention
        && !hasAlternative
        && !doctorateMentionIsContextual(before, after, clause)
        && positiveRequirement
      ) return true;
    }
  }
  return false;
}

const CLEARANCE_MENTION_SOURCE = String.raw`(?:security\s+clearance|(?:active|current|existing|interim)\s+(?:(?:u\.?s\.?|dod|government|federal)\s+)?clearance|(?:secret|top\s+secret)(?:[- ]level)?\s+(?:security\s+)?clearance|(?:security\s+)?clearance(?:\s+(?:at|to|of))?\s+(?:secret|top\s+secret)|top\s+secret(?:\s*\/\s*sci)?|ts\s*\/\s*sci(?:\s+(?:clearance|eligibility))?|sci\s+(?:clearance|eligibility)|access\s+to\s+classified\s+(?:information|material|systems))`;
const CLEARANCE_MENTION = new RegExp(String.raw`\b${CLEARANCE_MENTION_SOURCE}\b`);
const ACTIVE_CLEARANCE_MENTION = new RegExp(
  String.raw`\b(?:active|current|existing)\b[^.;|]{0,80}\b${CLEARANCE_MENTION_SOURCE}\b`
);

function hasPublicTrustAlternative(clause: string): boolean {
  const publicTrustThenClearance = new RegExp(
    String.raw`\bpublic trust\b[^.;|]{0,120}\b(?:or|in lieu of)\b[^.;|]{0,120}\b${CLEARANCE_MENTION_SOURCE}\b`
  );
  const clearanceThenPublicTrust = new RegExp(
    String.raw`\b${CLEARANCE_MENTION_SOURCE}\b[^.;|]{0,120}\b(?:or|in lieu of)\b[^.;|]{0,120}\bpublic trust\b`
  );
  return publicTrustThenClearance.test(clause) || clearanceThenPublicTrust.test(clause);
}

function stripNonRequirementsForClearance(clause: string): string {
  return clause
    .replace(/\bno\s+(?:active\s+|current\s+)?(?:security\s+)?clearance\s+(?:is\s+)?(?:required|needed|necessary)\b/g, " ")
    .replace(/\b(?:security\s+)?clearance\s+(?:is\s+)?not\s+(?:required|needed|necessary)\b/g, " ")
    .replace(/\b(?:does|do|will)\s+not\s+require\s+(?:an?\s+)?(?:security\s+)?clearance\b/g, " ")
    .replace(/\bclearance\s*:\s*(?:none|not required)\b/g, " ")
    // Public Trust is a suitability/background-investigation designation, not
    // a security clearance. Remove it before looking for a generic clearance.
    .replace(/\bpublic trust(?:\s+(?:suitability|designation|clearance))?\b/g, " ");
}

/**
 * True only for an explicit security-clearance gate. General citizenship,
 * export-control, Public Trust, and background-check language is intentionally
 * outside this signal.
 */
export function requiresSecurityClearance(description: string | null): boolean {
  if (!description) return false;

  for (const { text: originalClause, section } of qualificationClauses(description)) {
    if (hasPublicTrustAlternative(originalClause)) continue;

    // A clearance can be unnecessary on day one and still be a mandatory
    // condition of continued employment.
    const deferredRequirement = /\b(?:clearance|ts\s*\/\s*sci|top secret)\b[^.;|]{0,100}\bnot required\b[^.;|]{0,100}\b(?:to start|at (?:hire|start)|initially)\b[^.;|]{0,120}\b(?:but|however|although)\b[^.;|]{0,120}\b(?:must|need(?:ed)? to|will be required to)\s+(?:obtain|hold|possess|maintain)\b/.test(originalClause);
    if (deferredRequirement) return true;

    const clause = stripNonRequirementsForClearance(originalClause);
    const genericObtainRequirement = /\b(?:ability to|able to|eligible to|eligibility to|must|need(?:ed)? to|required to)\s+(?:be\s+able\s+to\s+)?(?:obtain|secure|hold|possess|maintain)\b[^.;|]{0,100}\b(?:an?\s+)?(?:security\s+)?clearance\b/.test(clause)
      || /\b(?:must be\s+)?eligible\s+for\b[^.;|]{0,80}\b(?:an?\s+)?(?:security\s+)?clearance\b/.test(clause);
    const mentionIndex = clause.search(CLEARANCE_MENTION);
    const hasMention = mentionIndex >= 0 || genericObtainRequirement;
    if (!hasMention) continue;
    const beforeMention = mentionIndex >= 0
      ? clause.slice(0, mentionIndex)
      : clause.slice(0, Math.max(0, clause.lastIndexOf("clearance")));

    const optionalMention = section === "preferred"
      || /\b(?:preferred qualifications?|we prefer|ideally|desirable|nice to have|bonus|a plus)\s*:?\s*$/.test(beforeMention)
      || /\b(?:clearance|ts\s*\/\s*sci|top secret)\b[^.;|]{0,100}\b(?:is\s+)?(?:preferred|desirable|a plus|nice to have)\b/.test(clause);
    if (optionalMention) continue;

    const positiveRequirement = section === "required"
      || genericObtainRequirement
      || /\b(?:required|requires?|must have|must hold|must possess|must maintain|condition of employment|minimum qualifications?)\b[^.;|]{0,120}$/.test(beforeMention)
      || /\b(?:clearance|ts\s*\/\s*sci|top secret)\b[^.;|]{0,120}\b(?:is\s+)?(?:required|mandatory|must be (?:held|maintained)|condition of employment)\b/.test(clause)
      || ACTIVE_CLEARANCE_MENTION.test(clause);
    if (positiveRequirement) return true;
  }
  return false;
}

function titleRequiresSecurityClearance(title: string): boolean {
  return /\b(?:ts\s*\/\s*sci|top secret|(?:active|current)\s+(?:secret|security)\s+clearance|secret\s+clearance)\b/i.test(title);
}

/**
 * Whether a doctorate mention is still ambiguous enough to need a human.
 *
 * This is deliberately separate from `requiresAdvancedDegree`: the latter only
 * makes a hard exclusion with positive evidence, while this function removes
 * known-safe mentions from review (preferred sections, eligible-degree
 * alternatives, equivalent-experience alternatives, collaborators, and the
 * PHD tracking filter acronym).
 */
function hasUncertainAdvancedDegreeMention(normalizedText: string): boolean {
  const doctorate = new RegExp(String.raw`\b${DOCTORATE_DEGREE_SOURCE}\b`, "g");
  for (const match of normalizedText.matchAll(doctorate)) {
    const start = match.index ?? 0;
    const before = normalizedText.slice(Math.max(0, start - 180), start);
    const after = normalizedText.slice(start + match[0].length, start + match[0].length + 180);
    const clause = `${before}${match[0]}${after}`;

    const trackingFilterAcronym = /^\s+filters?\b/.test(after);
    const collaboratorContext = /\b(?:collaborat(?:e|es|ing)|work(?:s|ing)? with|team of)\b[^.;]{0,90}$/.test(before);
    const optionalSection = /\b(?:preferred(?: skills(?:\s*(?:and|&)\s*experience)?| qualifications?)?|we prefer|ideally|desirable|nice to have|bonus|a plus|what (?:will|would) set you apart|ways? to stand out)\b[^.;]{0,180}$/.test(before)
      || /^[^.;]{0,100}\b(?:preferred|preferable|a plus|nice to have|bonus|desirable|optional)\b/.test(after);
    const equivalentExperience = /^[^.;]{0,120}\bor equivalent(?: practical| industry| research)? (?:experience|depth|track record)\b/.test(after);
    const experienceAlternative = /\b\d{1,2}\s*\+?\s*(?:years?|yrs?|yoe)(?:\s+of)?[^.;]{0,80}\bexperience\b[^.;]{0,80}\bor(?:\s+an?)?\s*$/.test(before)
      || /^[^.;]{0,100}\bor\s+(?:an?\s+)?(?:\d{1,2}\s*\+?\s*(?:years?|yrs?|yoe)(?:\s+of)?\s*)?(?:relevant\s+|industry\s+|research\s+)?experience\b/.test(after)
      || /^[^.;]{0,100}\bor\s+(?:have\s+)?(?:substantial\s+|equivalent\s+)?research experience\b/.test(after);
    const eligibleDegreeAlternative = hasEligibleDegreeAlternative(clause)
      || hasEligibleDegreeCohortAlternative(clause)
      || /\bb\.?\s*s\.?\s*[,/]\s*m\.?\s*s\.?\s*(?:,\s*)?(?:or\s+|and\/or\s+|\/\s*)(?:ph\.?\s?d\.?|doctorate|doctoral)\b/.test(clause);
    const biographicalContext = /\b(?:founded|started) by\b[^.;]{0,140}$/.test(before)
      || /\b(?:ceo|cto|professor|advisor)\b[^.;]{0,100}\b(?:holds?|earned|did|has)\s+(?:an?\s+|\w+\s+)?$/.test(before)
      || /\b(?:team includes?|alums? of)\b[^.;]{0,140}$/.test(before);
    const audienceContext = /\b(?:serve|serves|support|supports|built for|used by|help(?:s|ing)?)\b[^.;]{0,110}$/.test(before);
    const learnerContext = isDoctorateLearnerContext(before, after);
    const explicitlyUnnecessary = /^[^.;]{0,90}\b(?:is neither necessary nor sufficient|is not (?:necessary|required)|not required|not necessary)\b/.test(after);
    const independentResearcherAlternative = /\bph\.?\s?d\.? candidates?\b[^.;]{0,160}\bor independent researchers?\b/.test(clause);

    if (
      trackingFilterAcronym
      || collaboratorContext
      || optionalSection
      || equivalentExperience
      || experienceAlternative
      || eligibleDegreeAlternative
      || biographicalContext
      || audienceContext
      || learnerContext
      || explicitlyUnnecessary
      || independentResearcherAlternative
    ) continue;

    return true;
  }
  return false;
}

function hasExplicitInternshipSignal(
  title: string,
  description: string | null
): boolean {
  const normalizedTitle = normalizeClassifierText(title);
  if (hasAffirmativeWording(
    normalizedTitle,
    /\b(?:interns?|internships?|co-?ops?|apprentices?|apprenticeships?)\b/g
  )) {
    return true;
  }
  const text = normalizeClassifierText(description ?? "");
  const roleTerm = String.raw`(?:interns?|internships?|co-?ops?|apprentices?|apprenticeships?)`;
  const personRoleTerm = String.raw`(?:interns?|apprentices?)`;
  const explicitRolePatterns = [
    new RegExp(String.raw`\b${roleTerm}\s+(?:position|role|opportunity)\b`, "g"),
    new RegExp(String.raw`\bthis\s+(?:position|role|opportunity)\s+is\s+an?\s+${roleTerm}\b`, "g"),
    new RegExp(String.raw`\b(?:seeking|hiring|recruiting|looking\s+for)\s+(?:to\s+hire\s+)?an?\s+${roleTerm}\b`, "g"),
    // Recruiting copy commonly names the discipline before the person-role
    // noun ("seeking a software engineering intern"). Keep this bounded to
    // intern/apprentice people so "internship experience/program" remains an
    // incidental mention rather than an internship classification signal.
    new RegExp(
      String.raw`\b(?:seeking|hiring|recruiting|looking\s+for)\s+(?:to\s+hire\s+)?(?:an?\s+)?(?:(?!(?:not|no)\b)[a-z0-9+#.-]+\s+){0,5}${personRoleTerm}\b(?!\s+(?:experience|program|programme)\b)`,
      "g"
    ),
    new RegExp(String.raw`\bas\s+an?\s+${roleTerm}\b[^.;|]{0,24}\byou(?:'ll|\s+will)\b`, "g"),
    new RegExp(String.raw`\b(?:employment|job)\s+type\s*:?\s*${roleTerm}\b`, "g"),
  ];
  return explicitRolePatterns.some((pattern) => hasAffirmativeWording(text, pattern));
}

function hasRequiredGraduationWindow(description: string | null): boolean {
  if (!description) return false;
  const month = String.raw`(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)`;
  // A bare "may" is too ambiguous for a date signal ("may vary", "may
  // work"). Require months and seasons to carry a year while still accepting
  // a standalone four-digit graduation year.
  const dateToken = String.raw`(?:20\d{2}|(?:spring|summer|fall|autumn|winter)\s+20\d{2}|${month}\s+(?:\d{1,2},?\s+)?20\d{2}|20\d{2}\s+${month})`;
  const graduationWindow = new RegExp(
    String.raw`\b(?:expected|must|should|required|eligible)?\s*(?:to\s+)?graduat(?:e|ing|ion)\b[^.;|]{0,100}\b${dateToken}\b`
  );
  const graduationDateWindow = new RegExp(
    String.raw`\bgraduation\s+(?:date|window)\b[^.;|]{0,100}\b${dateToken}\b`
  );
  for (const { text, section } of qualificationClauses(description)) {
    const hasWindow = graduationWindow.test(text) || graduationDateWindow.test(text);
    if (!hasWindow) continue;
    const optional = section === "preferred"
      || /\b(?:preferred|ideally|desirable|nice to have|bonus|a plus|optional)\b/.test(text);
    if (!optional) return true;
  }
  return false;
}

function hasAffirmativeWording(text: string, pattern: RegExp): boolean {
  for (const match of text.matchAll(pattern)) {
    const start = match.index ?? 0;
    const before = text.slice(Math.max(0, start - 50), start);
    const after = text.slice(start + match[0].length, start + match[0].length + 60);
    const notOnly = /\bnot\s+only\b[^.;|,]{0,24}$/.test(before);
    const negatedBefore = !notOnly && (
      /\b(?:not|never)\b[^.;|,]{0,28}$/.test(before)
      || /\bno(?:\s+longer)?\b[^.;|,]{0,28}$/.test(before)
      || /\bnon[- ]$/.test(before)
    );
    const negatedAfter = /^[^.;|,]{0,45}\b(?:is|are|will|would|should)\s+not\b/.test(after);
    if (!negatedBefore && !negatedAfter) return true;
  }
  return false;
}

function hasExplicitNewGradSignal(title: string, description: string | null): boolean {
  const normalizedTitle = normalizeClassifierText(title);
  const normalizedDescription = normalizeClassifierText(description ?? "");
  return hasAffirmativeWording(
    normalizedTitle,
    /\b(?:new(?:[ -]college)?[ -]grad(?:uate)?s?|entry[ -]level|graduate)\b/g
  )
    || hasAffirmativeWording(
      normalizedDescription,
      /\b(?:new(?:[ -]college)?[ -]grad(?:uate)?s?|entry[ -]level|recent graduates?)\b/g
    )
    || hasRequiredGraduationWindow(description);
}

function classifySeniority(
  title: string,
  years: { min: number | null; max: number | null },
  description: string | null = null
): JobFeatures["seniority"] {
  const raw = normalizeClassifierText(title);
  // "Member of Technical Staff" is a level-less IC title, not a staff-level
  // one. It is the standard engineering title at OpenAI, Anthropic, xAI,
  // Mistral, Cursor and Cockroach Labs, and `\bstaff\b` silently discarded
  // every one of them — 43 of 43 in the historical corpus. Remove the phrase
  // before any level word is read, so the rest of the title still decides.
  const text = raw.replace(/\b(?:member of )?technical staff\b/g, " ");

  if (/\b(?:chief|vice president|vp|head of)\b/.test(text)) return "executive";
  if (/\b(?:manager|director)\b/.test(text)) return "manager";
  if (/\b(?:staff|principal|distinguished|fellow|technical leadership)\b/.test(text)) return "staff_plus";
  if (/\b(?:senior|sr\.?|lead)\b/.test(text)) return "senior";
  // Several large employers encode seniority numerically rather than spelling
  // out "senior". Levels 4+ are outside pinkslip's 0-3 year audience even when
  // the public description omits a literal years-of-experience requirement.
  if (
    /\bl\s*[4-9](?:\s*\/\s*l?\s*[4-9])?\b/.test(text)
    || /\b(?:engineer|developer|scientist|researcher)\s*(?:\(|,|-)?\s*(?:level\s*)?[4-9](?:\s*\/\s*[4-9])?\b/.test(text)
    || /\b(?:engineer|developer|scientist|researcher)\s+(?:iv|v|vi|vii|viii|ix)\b/.test(text)
    || /\blevel\s*(?:[4-9]|iv|v|vi|vii|viii|ix)\b/.test(text)
  ) return "senior";

  // Eligible-stage precedence is deliberate: an internship is not folded into
  // new-grad simply because its implied experience minimum is zero.
  if (hasExplicitInternshipSignal(title, description)) {
    return "internship";
  }
  if (hasExplicitNewGradSignal(title, description) || years.min === 0) {
    return "new_grad";
  }
  if (/\b(?:early[ -]career|junior|associate)\b/.test(text)) {
    return "early_career";
  }
  if ((years.min ?? 0) >= 5) return "senior";
  if ((years.min ?? 0) > MAX_YEARS_EXPERIENCE) return "mid_level";
  // One-to-three-year requirements and otherwise unlevelled roles are both
  // early-career. The latter must never leak into internship or new-grad-only
  // selections.
  return "early_career";
}

/**
 * Cheap title-only guard for list adapters that already carry full job HTML.
 * A description can reveal a high experience minimum later, but it cannot make
 * an explicitly senior/staff/management title eligible for Pinkslip's fixed
 * early-career audience. Avoiding that HTML materially reduces poll memory.
 */
export function hasPotentiallyEligibleSeniority(title: string): boolean {
  return isEligibleSeniority(classifySeniority(title, { min: null, max: null }));
}

function parseMoneyToken(token: string): number | null {
  const hourly = /(?:\/|\b)(?:hr|hour)\b/i.test(token);
  const thousands = /k\b/i.test(token);
  const numeric = Number.parseFloat(token.replace(/[$,]/g, "").replace(/usd/gi, "").replace(/k\b/i, ""));
  if (!Number.isFinite(numeric)) return null;
  const amount = thousands || (!hourly && numeric < 1000) ? numeric * 1000 : numeric;
  return Math.round(amount);
}

export function parseSalary(salary: string | null): Pick<JobFeatures, "salary_min" | "salary_max" | "salary_currency" | "salary_period"> {
  if (!salary) return { salary_min: null, salary_max: null, salary_currency: null, salary_period: null };
  const hourly = /(?:\/|\b)(?:hr|hour|hourly)\b/i.test(salary);
  const values = (salary.match(/(?:\$|USD\s*)?\s*\d[\d,]*(?:\.\d+)?\s*k?/gi) ?? [])
    .map(parseMoneyToken)
    .filter((value): value is number => value !== null && value > 0);
  return {
    salary_min: values.length > 0 ? Math.min(...values) : null,
    salary_max: values.length > 0 ? Math.max(...values) : null,
    salary_currency: /\$|\bUSD\b/i.test(salary) ? "USD" : null,
    salary_period: values.length > 0 ? (hourly ? "hour" : "year") : null,
  };
}

const INTERNSHIP_SPECIALTY_SIGNALS: ReadonlyArray<{
  id: RoleId;
  pattern: RegExp;
}> = [
  { id: "forward_deployed", pattern: /\bforward[ -]deploy(?:ed|ment)\b/ },
  { id: "frontend", pattern: /\b(?:frontend|front end|front-end|web|ui)\b/ },
  { id: "backend", pattern: /\b(?:backend|back end|back-end|server|api)\b/ },
  { id: "full_stack", pattern: /\bfull[ -]?stack\b/ },
  { id: "mobile", pattern: /\b(?:mobile|ios|android|react native)\b/ },
  { id: "data_engineering", pattern: /\b(?:data engineering|data platform|analytics engineering)\b/ },
  { id: "machine_learning", pattern: /\b(?:machine learning|data science|artificial intelligence|ai|ml)\b/ },
  { id: "research", pattern: /\b(?:research|applied scien(?:ce|tist))\b/ },
  { id: "infrastructure", pattern: /\b(?:infrastructure|platform|site reliability|sre|devops|cloud|developer productivity)\b/ },
  { id: "security", pattern: /\b(?:security|cyber ?security)\b/ },
  // Keep this last. `specificRoleSpecialties` removes the generic SWE family
  // whenever a more precise internship discipline is also present.
  { id: "software_engineering", pattern: /\b(?:software|engineering|developer|programmer|programming|swe|sde|quantitative|quant|algorithmic trading|trading)\b/ },
];

export function classifyJob(listing: JobListing): JobFeatures {
  const title = listing.title.toLowerCase();
  const department = listing.department?.toLowerCase() ?? "";
  const searchable = `${title}\n${department}`;
  const specialtyMatches = ROLE_OPTIONS
    .filter((role) => role.keywords.some((keyword) => containsPhrase(title, keyword)))
    .map((role) => role.id);
  const internshipSpecialtyMatches = hasExplicitInternshipSignal(
    listing.title,
    listing.description
  )
    ? INTERNSHIP_SPECIALTY_SIGNALS
      .filter(({ pattern }) => pattern.test(title))
      .map(({ id }) => id)
    : [];
  // Departments are useful supporting evidence, but they are too broad to
  // assign a specialty by themselves (for example, data scientists often sit
  // inside "Product"). Specialty classification remains title-first.
  const departmentMatches: RoleId[] = [];
  const specialties = specificRoleSpecialties([
    ...specialtyMatches,
    ...internshipSpecialtyMatches,
    ...departmentMatches,
    ...(/\bsoftware(?: dev(?:elopment)?)? engineer\b/.test(title)
      || (/\b(?:flight )?software associate\b/.test(title)
        && /\bsoftware\b/i.test(listing.department ?? ""))
      ? ["software_engineering" as const] : []),
  ]);
  const primary = ROLE_OPTIONS.find((role) => specialties.includes(role.id));
  const qualificationRequirements = parseQualificationRequirements(listing.description);
  const years = experienceFromRequirements(listing.title, listing.description, qualificationRequirements);
  const location = listing.location.toLowerCase();
  const workMode: JobFeatures["work_mode"] =
    /\bhybrid\b/.test(location) ? "hybrid"
      : /\bremote\b/.test(location) ? "remote"
        : location.trim() ? "onsite" : "unknown";
  const countries = /\b(?:canada|uk|united kingdom|europe|emea|india|australia)\b/.test(location)
    && !/\b(?:us|usa|united states)\b/.test(location)
    ? []
    : ["US"];
  const metros = LOCATION_OPTIONS
    .filter((metro) => metro.aliases.some((alias) => location.includes(alias)))
    .map((metro) => metro.id);
  const salary = parseSalary(listing.salary);
  const description = listing.description?.toLowerCase() ?? "";
  const sponsorshipAvailable = /\b(?:visa|immigration)\s+sponsorship\s+(?:is\s+)?available\b/.test(description)
    || /\bwe (?:do|can) sponsor\b/.test(description)
    ? true
    : /\b(?:unable|not able) to sponsor\b/.test(description)
      || /\b(?:do not|don't|cannot|can't|will not|won't) sponsor\b/.test(description)
      || /\bno (?:visa|immigration) sponsorship\b/.test(description)
      ? false
      : null;
  const titleConfidence = specialties.length > 0 ? 0.9 : departmentMatches.length > 0 ? 0.62 : 0.35;
  const confidence = Math.min(0.98, titleConfidence + (years.min !== null ? 0.04 : 0) + (workMode !== "unknown" ? 0.03 : 0));

  return {
    role_family: primary?.family ?? (/\b(?:engineer|developer)\b/.test(searchable) ? "engineering" : "other"),
    specialties: specialties.length > 0 ? specialties : [],
    seniority: classifySeniority(listing.title, years, listing.description),
    min_years: years.min,
    max_years: years.max,
    work_mode: workMode,
    countries,
    metro_areas: metros,
    ...salary,
    sponsorship_available: sponsorshipAvailable,
    qualification_requirements: qualificationRequirements,
    // A doctorate in the public title scopes the role to doctorate candidates
    // even when the ATS omits or has not yet hydrated the description.
    requires_advanced_degree: titleRequiresAdvancedDegree(listing.title)
      || requiresAdvancedDegree(listing.description),
    // Clearance levels in a public title are themselves a scope signal; body
    // mentions still need the requirement-aware detector above.
    requires_security_clearance: titleRequiresSecurityClearance(listing.title)
      || requiresSecurityClearance(listing.description),
    classifier_version: JOB_CLASSIFIER_VERSION,
    confidence,
  };
}

export function classifyReviewReasons(
  listing: JobListing,
  features: JobFeatures
): JobReviewReason[] {
  const reasons: JobReviewReason[] = [];
  const title = normalizeClassifierText(listing.title);
  const text = normalizeClassifierText(`${listing.title}\n${listing.description ?? ""}`);

  // The review queue is an eligibility safety net, not a catalog of every
  // uncertain phrase. A human decision cannot make a known senior/staff role or
  // a 4+ year requirement eligible, so queuing those rows only creates work and
  // hides the genuinely ambiguous early-career cases among them.
  if (
    !isEligibleSeniority(features.seniority)
    || (features.min_years !== null && features.min_years > MAX_YEARS_EXPERIENCE)
    || features.requires_advanced_degree
    || features.requires_security_clearance
  ) {
    return reasons;
  }

  if (
    features.min_years === null
    && /\b(?:at least|minimum|requires?|must have)\s+\d{1,2}\s*(?:\+\s*)?(?:years?|yrs?|yoe)\b/.test(requiredExperienceText(text))
  ) {
    reasons.push("experience_requirement_unparsed");
  }

  if (
    features.min_years === null
    && /\b(?:engineer|developer|scientist|researcher)\s*(?:\(|,|-)?\s*(?:level\s*)?(?:2|3|ii|iii)\b(?!\s*(?:years?|yrs?|yoe|months?|fixed[ -]term))/.test(title)
  ) {
    reasons.push("ambiguous_title_level");
  }

  if (
    !features.requires_advanced_degree
    && hasUncertainAdvancedDegreeMention(text)
  ) {
    reasons.push("advanced_degree_uncertain");
  }

  return reasons;
}

export function rowToListing(row: FeatureJobRow): JobListing {
  return {
    externalId: row.external_id,
    title: row.title,
    url: row.url,
    location: row.location,
    department: row.department,
    postedAt: row.posted_at,
    description: row.description,
    salary: row.salary,
  };
}

export async function upsertJobFeatures(
  db: D1Database,
  jobs: Array<{ jobId: string; listing: JobListing; sourceUpdatedAt?: string | null }>
) {
  if (jobs.length === 0) return;
  for (let offset = 0; offset < jobs.length; offset += 75) {
    const classified = jobs.slice(offset, offset + 75).map(({ jobId, listing, sourceUpdatedAt }) => ({
      jobId,
      listing,
      sourceUpdatedAt,
      feature: classifyJob(listing),
    }));
    await db.batch(classified.map(({ jobId, listing, sourceUpdatedAt, feature }) => {
      return db.prepare(
        `INSERT INTO job_features (
           job_id, role_family, specialties_json, seniority, min_years, max_years,
           work_mode, countries_json, metro_areas_json, salary_min, salary_max,
           salary_currency, salary_period, sponsorship_available,
           requires_advanced_degree, requires_security_clearance, qualification_requirements_json,
           classifier_version, confidence, source_updated_at, classified_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(job_id) DO UPDATE SET
           role_family = excluded.role_family,
           specialties_json = excluded.specialties_json,
           seniority = excluded.seniority,
           min_years = excluded.min_years,
           max_years = excluded.max_years,
           work_mode = excluded.work_mode,
           countries_json = excluded.countries_json,
           metro_areas_json = excluded.metro_areas_json,
           salary_min = excluded.salary_min,
           salary_max = excluded.salary_max,
           salary_currency = excluded.salary_currency,
           salary_period = excluded.salary_period,
           sponsorship_available = excluded.sponsorship_available,
           requires_advanced_degree = excluded.requires_advanced_degree,
           requires_security_clearance = excluded.requires_security_clearance,
           qualification_requirements_json = excluded.qualification_requirements_json,
           classifier_version = excluded.classifier_version,
           confidence = excluded.confidence,
           source_updated_at = excluded.source_updated_at,
           classified_at = excluded.classified_at`
      ).bind(
        jobId,
        feature.role_family,
        JSON.stringify(feature.specialties),
        feature.seniority,
        feature.min_years,
        feature.max_years,
        feature.work_mode,
        JSON.stringify(feature.countries),
        JSON.stringify(feature.metro_areas),
        feature.salary_min,
        feature.salary_max,
        feature.salary_currency,
        feature.salary_period,
        feature.sponsorship_available === null ? null : feature.sponsorship_available ? 1 : 0,
        feature.requires_advanced_degree ? 1 : 0,
        feature.requires_security_clearance ? 1 : 0,
        JSON.stringify(feature.qualification_requirements),
        feature.classifier_version,
        feature.confidence,
        sourceUpdatedAt ?? listing.postedAt,
        new Date().toISOString()
      );
    }));

    await db.batch(classified.map(({ jobId, listing, feature }) => {
      const reasons = classifyReviewReasons(listing, feature);
      if (reasons.length === 0) {
        return db.prepare(
          // A newer classifier can resolve a pending ambiguity, but reviewed
          // rows are durable human labels. Keep approved/rejected history even
          // when computed features now make the eligibility decision.
          "DELETE FROM job_review_queue WHERE job_id = ? AND state = 'needs_review'"
        ).bind(jobId);
      }

      const now = new Date().toISOString();
      return db.prepare(
        `INSERT INTO job_review_queue (
           job_id, state, reason_codes_json, evidence_json, classifier_version,
           created_at, updated_at
         ) VALUES (?, 'needs_review', ?, ?, ?, ?, ?)
         ON CONFLICT(job_id) DO UPDATE SET
           state = CASE
             WHEN job_review_queue.reason_codes_json != excluded.reason_codes_json
               OR (
                 job_review_queue.classifier_version = excluded.classifier_version
                 AND job_review_queue.evidence_json != excluded.evidence_json
               )
               THEN 'needs_review'
             ELSE job_review_queue.state
           END,
           reason_codes_json = excluded.reason_codes_json,
           evidence_json = excluded.evidence_json,
           classifier_version = excluded.classifier_version,
           admin_note = CASE
             WHEN job_review_queue.reason_codes_json != excluded.reason_codes_json
               OR (
                 job_review_queue.classifier_version = excluded.classifier_version
                 AND job_review_queue.evidence_json != excluded.evidence_json
               ) THEN NULL
             ELSE job_review_queue.admin_note
           END,
           reviewed_by = CASE
             WHEN job_review_queue.reason_codes_json != excluded.reason_codes_json
               OR (
                 job_review_queue.classifier_version = excluded.classifier_version
                 AND job_review_queue.evidence_json != excluded.evidence_json
               ) THEN NULL
             ELSE job_review_queue.reviewed_by
           END,
           reviewed_at = CASE
             WHEN job_review_queue.reason_codes_json != excluded.reason_codes_json
               OR (
                 job_review_queue.classifier_version = excluded.classifier_version
                 AND job_review_queue.evidence_json != excluded.evidence_json
               ) THEN NULL
             ELSE job_review_queue.reviewed_at
           END,
           updated_at = excluded.updated_at`
      ).bind(
        jobId,
        JSON.stringify(reasons),
        JSON.stringify({
          title: listing.title,
          description_excerpt: normalizeClassifierText(listing.description ?? "").slice(0, 600),
          min_years: feature.min_years,
          seniority: feature.seniority,
          requires_advanced_degree: feature.requires_advanced_degree,
          requires_security_clearance: feature.requires_security_clearance,
        }),
        feature.classifier_version,
        now,
        now
      );
    }));
  }
}

export async function ensureJobFeatures(db: D1Database, limit = 750) {
  const result = await db.prepare(
    `SELECT j.id, j.external_id, j.title, j.url, j.location, j.department,
            j.posted_at, j.first_seen_at, j.description, j.salary
     FROM jobs j
     JOIN companies c ON c.id = j.company_id
     LEFT JOIN job_features jf ON jf.job_id = j.id
     WHERE c.enabled = 1
       AND j.closed_at IS NULL
       AND (jf.job_id IS NULL OR jf.classifier_version != ?
         OR jf.requires_advanced_degree IS NULL
         OR jf.requires_security_clearance IS NULL)
     ORDER BY CASE
       WHEN lower(j.title) LIKE '%internship%'
         OR lower(j.title) LIKE '% intern%'
         OR lower(j.title) LIKE 'intern%'
         OR lower(j.title) LIKE '%co-op%'
         OR lower(j.title) LIKE '%coop%'
         OR lower(j.title) LIKE '%apprentice%'
         THEN 0 ELSE 1 END,
       j.first_seen_at DESC
     LIMIT ?`
  ).bind(JOB_CLASSIFIER_VERSION, limit).all<FeatureJobRow>();
  const rows = result.results ?? [];
  await upsertJobFeatures(db, rows.map((row) => ({ jobId: row.id, listing: rowToListing(row) })));
  return rows.length;
}

export async function ensureJobFeaturesForIds(db: D1Database, jobIds: string[]) {
  if (jobIds.length === 0) return;
  // D1 statements allow at most 100 bound parameters. Leave headroom for the
  // classifier version and future predicates while keeping each reclassification
  // batch aligned with the existing feature-upsert batch size.
  for (let offset = 0; offset < jobIds.length; offset += 75) {
    const ids = jobIds.slice(offset, offset + 75);
    const placeholders = ids.map(() => "?").join(", ");
    const result = await db.prepare(
      `SELECT j.id, j.external_id, j.title, j.url, j.location, j.department,
              j.posted_at, j.first_seen_at, j.description, j.salary
       FROM jobs j
       LEFT JOIN job_features jf ON jf.job_id = j.id
       WHERE j.id IN (${placeholders})
         AND (jf.job_id IS NULL OR jf.classifier_version != ?
           OR jf.requires_advanced_degree IS NULL
           OR jf.requires_security_clearance IS NULL)`
    ).bind(...ids, JOB_CLASSIFIER_VERSION).all<FeatureJobRow>();
    await upsertJobFeatures(
      db,
      (result.results ?? []).map((row) => ({ jobId: row.id, listing: rowToListing(row) }))
    );
  }
}
