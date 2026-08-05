import {
  LOCATION_OPTIONS,
  ROLE_OPTIONS,
  specificRoleSpecialties,
  type ExperienceLevel,
  type LocationId,
  type RoleFamily,
  type RoleId,
  type WorkMode,
} from "../shared/search-profile";
import type { JobListing } from "./adapters/types";

// v10 makes explicit specialties take precedence over generic SWE while
// preserving the v9 experience, degree, and ambiguous-level behavior.
export const JOB_CLASSIFIER_VERSION = "deterministic-v10";

export type JobReviewReason =
  | "ambiguous_title_level"
  | "experience_requirement_unparsed"
  | "advanced_degree_uncertain";

export interface JobFeatures {
  role_family: RoleFamily;
  specialties: RoleId[];
  seniority: ExperienceLevel | "manager" | "executive" | "unknown";
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
  classifier_version: string;
  confidence: number;
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

function normalizeClassifierText(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/[‐‑‒–—]/g, "-")
    .replace(/\b(?:zero|one|two|three|four|five|six|seven|eight|nine|ten)\b/gi, (word) => NUMBER_WORDS[word.toLowerCase()] ?? word)
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function parseExperienceRequirement(
  title: string,
  description: string | null
): { min: number | null; max: number | null } {
  const text = normalizeClassifierText(`${title}\n${description ?? ""}`);
  // Preference-only figures must never raise the eligibility ceiling. Remove
  // both "preferred: 7+ years" and "7+ years preferred" before collecting
  // mandatory requirements.
  const requiredText = text
    .replace(/\b(?:preferred|ideally|nice to have|bonus|a plus|desirable)\b[^.;|]*/g, " ")
    .replace(/\b\d{1,2}\s*(?:\+|\s*-\s*\d{1,2})?\s*(?:years?|yrs?)[^.;|]{0,45}\b(?:preferred|ideal|a plus|nice to have|bonus|desirable)\b/g, " ");
  const candidates: Array<{ min: number; max: number | null }> = [];
  const collect = (pattern: RegExp, maxGroup?: number) => {
    for (const match of requiredText.matchAll(pattern)) {
      const min = Number(match[1]);
      const max = maxGroup ? Number(match[maxGroup]) : null;
      if (Number.isFinite(min)) {
        candidates.push({ min, max: max !== null && Number.isFinite(max) ? max : null });
      }
    }
  };
  // Explicit range, e.g. "3-5 years" — but not "3-5 years ago".
  collect(/\b(\d{1,2})\s*(?:-|–|to)\s*(\d{1,2})\s*(?:\+?\s*)?(?:years?|yrs?)\b(?!\s*ago)/g, 2);
  // A bare "N years" elsewhere in the description ("founded 3 years ago",
  // "10 years of free snacks") is not an experience requirement. Require a
  // requirement cue: an explicit qualifier ("at least/minimum N years", "N+
  // years") or an experience-context phrase ("N years of experience").
  collect(/\b(?:at least|minimum of|minimum|min\.?|requires?|require)\s+(\d{1,2})\s*\+?\s*(?:years?|yrs?)\b/g);
  collect(/\b(\d{1,2})\s*\+\s*(?:years?|yrs?)\b(?!\s*ago)/g);
  collect(/\b(\d{1,2})\s*\+?\s*(?:years?|yrs?)\s+(?:of\s+)?(?:relevant\s+|professional\s+|industry\s+|related\s+|work\s+|hands-on\s+)?experience\b/g);
  collect(/\b(\d{1,2})\s*\+?\s*(?:years?|yrs?)\s+(?:of\s+)?(?:building|developing|designing|engineering|programming|working)\b/g);
  if (candidates.length > 0) {
    // If a posting lists multiple mandatory requirements, the strictest minimum
    // is the one that determines whether an early-career applicant qualifies.
    return candidates.sort((a, b) => b.min - a.min)[0];
  }
  // "intern" is matched against the title only. A description that mentions an
  // internship programme says nothing about the level of the role being
  // advertised, and matching it against the body scored senior postings as
  // zero-years and admitted them to an early-career feed.
  if (/\b(?:intern|internship|co-op)\b/.test(title.toLowerCase())) {
    return { min: 0, max: 2 };
  }
  if (/\b(?:new[ -]grad|new graduate|entry[ -]level|early[ -]career)\b/.test(text)) {
    return { min: 0, max: 2 };
  }
  return { min: null, max: null };
}

/**
 * True when a doctorate is stated as a requirement rather than offered as one
 * acceptable background among several.
 *
 * In a production sample, 23 of 82 admitted "unknown experience" postings
 * mentioned a PhD — the single largest contaminant in the early-career feed.
 * But the mention alone is not disqualifying: labs routinely write "MS or PhD
 * preferred" or "PhD ... or equivalent practical experience" on roles that hire
 * strong bachelor's graduates, so only unhedged requirements count.
 */
export function requiresAdvancedDegree(description: string | null): boolean {
  if (!description) return false;
  const text = description
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&nbsp;|&#160;/gi, " ").replace(/&amp;/gi, "&")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .toLowerCase();

  const doctorate = /\b(?:ph\.?\s?d\.?|doctorate|doctoral)\b/g;
  for (const match of text.matchAll(doctorate)) {
    const start = match.index ?? 0;
    // Look at the clause around the mention. A hedge anywhere nearby — before
    // or after — means the doctorate is one accepted option, not a gate.
    const clause = text.slice(Math.max(0, start - 90), start + 130);
    const hedged = /\b(?:preferred|a plus|nice to have|or equivalent|equivalent practical|bonus|ideally|desirable|ms or|m\.?s\.?\s*\/|bachelor'?s? (?:degree )?(?:required|or))\b/.test(clause);
    const positiveRequirement = /\b(?:required|requires?|requirements?|must have|minimum qualification|qualifications?)\b/.test(clause);
    if (!hedged && positiveRequirement) return true;
  }
  return false;
}

function classifySeniority(
  title: string,
  years: { min: number | null; max: number | null }
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
  // Explicit level markers are read before the generic ladder below, so
  // "Member of Technical Staff (Early Career)" and "New Grad Program" are not
  // outranked by an incidental "staff" or "senior".
  if (/\b(?:intern|internship|co-op)\b/.test(text)) return "internship";
  if (/\b(?:new[ -]grad|new graduate|entry[ -]level|early[ -]career|junior|associate)\b/.test(text)) return "new_grad";
  if (/\b(?:staff|principal|distinguished|fellow)\b/.test(text)) return "staff_plus";
  if (/\b(?:senior|sr\.?|lead)\b/.test(text)) return "senior";
  // Several large employers encode seniority numerically rather than spelling
  // out "senior". Levels 4+ are outside pinkslip's 0-3 year audience even when
  // the public description omits a literal years-of-experience requirement.
  if (
    /\bl\s*[4-9](?:\s*\/\s*l?\s*[4-9])?\b/.test(text)
    || /\b(?:engineer|developer|scientist|researcher)\s*(?:\(|,|-)?\s*(?:level\s*)?[4-9](?:\s*\/\s*[4-9])?\b/.test(text)
    || /\b(?:engineer|developer|scientist|researcher)\s+(?:iv|v|vi|vii|viii|ix)\b/.test(text)
  ) return "senior";
  if (/\bgraduate\b/.test(text)) return "new_grad";
  if ((years.min ?? 0) >= 5) return "senior";
  if ((years.min ?? 0) >= 3) return "mid_level";
  if (years.min !== null) return "early_career";
  return "unknown";
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

export function classifyJob(listing: JobListing): JobFeatures {
  const title = listing.title.toLowerCase();
  const department = listing.department?.toLowerCase() ?? "";
  const searchable = `${title}\n${department}`;
  const specialtyMatches = ROLE_OPTIONS
    .filter((role) => role.keywords.some((keyword) => containsPhrase(title, keyword)))
    .map((role) => role.id);
  // Departments are useful supporting evidence, but they are too broad to
  // assign a specialty by themselves (for example, data scientists often sit
  // inside "Product"). Specialty classification remains title-first.
  const departmentMatches: RoleId[] = [];
  const specialties = specificRoleSpecialties([...specialtyMatches, ...departmentMatches]);
  const primary = ROLE_OPTIONS.find((role) => specialties.includes(role.id));
  const years = parseExperienceRequirement(listing.title, listing.description);
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
  const titleConfidence = specialtyMatches.length > 0 ? 0.9 : departmentMatches.length > 0 ? 0.62 : 0.35;
  const confidence = Math.min(0.98, titleConfidence + (years.min !== null ? 0.04 : 0) + (workMode !== "unknown" ? 0.03 : 0));

  return {
    role_family: primary?.family ?? (/\b(?:engineer|developer)\b/.test(searchable) ? "engineering" : "other"),
    specialties: specialties.length > 0 ? specialties : [],
    seniority: classifySeniority(listing.title, years),
    min_years: years.min,
    max_years: years.max,
    work_mode: workMode,
    countries,
    metro_areas: metros,
    ...salary,
    sponsorship_available: sponsorshipAvailable,
    requires_advanced_degree: requiresAdvancedDegree(listing.description),
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

  if (
    features.min_years === null
    && /\b(?:at least|minimum|requires?|must have)\s+\d{1,2}\s*(?:\+\s*)?(?:years?|yrs?)\b/.test(text)
  ) {
    reasons.push("experience_requirement_unparsed");
  }

  if (
    features.min_years === null
    && /\b(?:engineer|developer|scientist|researcher)\s*(?:\(|,|-)?\s*(?:level\s*)?(?:2|3|ii|iii)\b/.test(title)
  ) {
    reasons.push("ambiguous_title_level");
  }

  const hasAdvancedDegreeMention = /\b(?:ph\.?\s?d\.?|doctorate|doctoral)\b/.test(text);
  const clearlyContextual = /\b(?:collaborat(?:e|es|ing)|work(?:s|ing)? with|team of)\b[^.;]{0,70}\b(?:ph\.?\s?d\.?|doctorate|doctoral)\b/.test(text);
  const clearlyHedged = /\b(?:ph\.?\s?d\.?|doctorate|doctoral)\b[^.;]{0,80}\b(?:preferred|a plus|nice to have|or equivalent|bonus|desirable)\b/.test(text);
  if (hasAdvancedDegreeMention && !features.requires_advanced_degree && !clearlyContextual && !clearlyHedged) {
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
           requires_advanced_degree,
           classifier_version, confidence, source_updated_at, classified_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
             WHEN job_review_queue.classifier_version != excluded.classifier_version
               THEN 'needs_review'
             ELSE job_review_queue.state
           END,
           reason_codes_json = excluded.reason_codes_json,
           evidence_json = excluded.evidence_json,
           classifier_version = excluded.classifier_version,
           admin_note = CASE
             WHEN job_review_queue.classifier_version != excluded.classifier_version THEN NULL
             ELSE job_review_queue.admin_note
           END,
           reviewed_by = CASE
             WHEN job_review_queue.classifier_version != excluded.classifier_version THEN NULL
             ELSE job_review_queue.reviewed_by
           END,
           reviewed_at = CASE
             WHEN job_review_queue.classifier_version != excluded.classifier_version THEN NULL
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
       AND (jf.job_id IS NULL OR jf.classifier_version != ?)
     ORDER BY j.first_seen_at DESC
     LIMIT ?`
  ).bind(JOB_CLASSIFIER_VERSION, limit).all<FeatureJobRow>();
  const rows = result.results ?? [];
  await upsertJobFeatures(db, rows.map((row) => ({ jobId: row.id, listing: rowToListing(row) })));
  return rows.length;
}

export async function ensureJobFeaturesForIds(db: D1Database, jobIds: string[]) {
  if (jobIds.length === 0) return;
  const placeholders = jobIds.map(() => "?").join(", ");
  const result = await db.prepare(
    `SELECT j.id, j.external_id, j.title, j.url, j.location, j.department,
            j.posted_at, j.first_seen_at, j.description, j.salary
     FROM jobs j
     LEFT JOIN job_features jf ON jf.job_id = j.id
     WHERE j.id IN (${placeholders})
       AND (jf.job_id IS NULL OR jf.classifier_version != ?)`
  ).bind(...jobIds, JOB_CLASSIFIER_VERSION).all<FeatureJobRow>();
  await upsertJobFeatures(
    db,
    (result.results ?? []).map((row) => ({ jobId: row.id, listing: rowToListing(row) }))
  );
}
