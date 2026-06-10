import {
  LOCATION_OPTIONS,
  ROLE_OPTIONS,
  type ExperienceLevel,
  type LocationId,
  type RoleFamily,
  type RoleId,
  type WorkMode,
} from "../shared/search-profile";
import type { JobListing } from "./adapters/types";

export const JOB_CLASSIFIER_VERSION = "deterministic-v4";

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

export function parseExperienceRequirement(
  title: string,
  description: string | null
): { min: number | null; max: number | null } {
  const text = `${title}\n${description ?? ""}`.toLowerCase();
  // Explicit range, e.g. "3-5 years" — but not "3-5 years ago".
  const range = text.match(/\b(\d{1,2})\s*(?:-|–|to)\s*(\d{1,2})\s*(?:\+?\s*)?(?:years?|yrs?)\b(?!\s*ago)/);
  if (range) return { min: Number(range[1]), max: Number(range[2]) };
  // A bare "N years" elsewhere in the description ("founded 3 years ago",
  // "10 years of free snacks") is not an experience requirement. Require a
  // requirement cue: an explicit qualifier ("at least/minimum N years", "N+
  // years") or an experience-context phrase ("N years of experience").
  const qualified = text.match(/\b(?:at least|minimum of|minimum|min\.?|requires?|require)\s+(\d{1,2})\s*\+?\s*(?:years?|yrs?)\b/);
  if (qualified) return { min: Number(qualified[1]), max: null };
  const plus = text.match(/\b(\d{1,2})\s*\+\s*(?:years?|yrs?)\b(?!\s*ago)/);
  if (plus) return { min: Number(plus[1]), max: null };
  const withExperience = text.match(/\b(\d{1,2})\s*\+?\s*(?:years?|yrs?)\s+(?:of\s+)?(?:relevant\s+|professional\s+|industry\s+|related\s+|work\s+|hands-on\s+)?experience\b/);
  if (withExperience) return { min: Number(withExperience[1]), max: null };
  if (/\b(?:intern|internship|new grad|new graduate|entry level|early career)\b/.test(text)) {
    return { min: 0, max: 2 };
  }
  return { min: null, max: null };
}

function classifySeniority(
  title: string,
  years: { min: number | null; max: number | null }
): JobFeatures["seniority"] {
  const text = title.toLowerCase();
  if (/\b(?:chief|vice president|vp|head of)\b/.test(text)) return "executive";
  if (/\b(?:manager|director)\b/.test(text) && !/\bproduct manager\b/.test(text)) return "manager";
  if (/\b(?:staff|principal|distinguished|fellow)\b/.test(text)) return "staff_plus";
  if (/\b(?:senior|sr\.?|lead)\b/.test(text)) return "senior";
  if (/\b(?:intern|internship|co-op)\b/.test(text)) return "internship";
  if (/\b(?:new grad|new graduate|entry level|early career|graduate)\b/.test(text)) return "new_grad";
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
  const specialties = [...new Set([...specialtyMatches, ...departmentMatches])];
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
    classifier_version: JOB_CLASSIFIER_VERSION,
    confidence,
  };
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
    await db.batch(jobs.slice(offset, offset + 75).map(({ jobId, listing, sourceUpdatedAt }) => {
      const feature = classifyJob(listing);
      return db.prepare(
        `INSERT INTO job_features (
           job_id, role_family, specialties_json, seniority, min_years, max_years,
           work_mode, countries_json, metro_areas_json, salary_min, salary_max,
           salary_currency, salary_period, sponsorship_available,
           classifier_version, confidence, source_updated_at, classified_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        feature.classifier_version,
        feature.confidence,
        sourceUpdatedAt ?? listing.postedAt,
        new Date().toISOString()
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
     ORDER BY datetime(j.first_seen_at) DESC
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
