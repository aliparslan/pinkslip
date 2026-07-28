import { ROLE_OPTIONS } from "../shared/search-profile";
import type { JobListing } from "./adapters/types";
import { isUsJobLocation } from "./us-jobs";
import { isFreshPostedAt } from "../shared/job-policy";

const SUPPORTED_ROLE_KEYWORDS = ROLE_OPTIONS.flatMap((role) => role.keywords);

const SUPPORTED_TITLE_PATTERNS = [
  ...SUPPORTED_ROLE_KEYWORDS,
  "software development engineer",
  "software engineering",
  "embedded engineer",
  "firmware engineer",
  "database engineer",
  "release engineer",
  "build engineer",
  "qa engineer",
  "quality assurance engineer",
  "test automation engineer",
  "sdet",
  "solutions architect",
  "software architect",
  "cloud architect",
  "developer advocate",
  "developer relations",
  "quantitative developer",
  "quantitative researcher",
] as const;

const UNSUPPORTED_TITLE_PATTERNS = [
  "account executive",
  "administrative assistant",
  "chief of staff",
  "content strategist",
  "controller",
  "customer experience",
  "customer success",
  "customer support",
  "executive assistant",
  "financial analyst",
  "general counsel",
  "human resources",
  "legal counsel",
  "local product engineer",
  "mechanical product engineer",
  "operations coordinator",
  "paralegal",
  "people operations",
  "recruiter",
  "recruiting",
  "sales development",
  "sales engineer",
  "sales representative",
  "social media",
  "support engineer",
  "talent acquisition",
] as const;

const MANAGEMENT_PATTERN =
  /\b(?:chief|director|head of|manager|president|vice president|vp|svp|evp|avp)\b/i;

function containsPhrase(text: string, phrase: string) {
  if (phrase.includes(" ")) return text.includes(phrase);
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}\\b`, "i").test(text);
}

export function isTargetJobTitle(title: string, department?: string | null): boolean {
  const normalizedTitle = title.trim().toLowerCase();
  const normalizedDepartment = department?.trim().toLowerCase() ?? "";
  if (!normalizedTitle) return false;

  if (MANAGEMENT_PATTERN.test(normalizedTitle)) {
    return false;
  }

  if (UNSUPPORTED_TITLE_PATTERNS.some((pattern) => containsPhrase(normalizedTitle, pattern))) {
    return false;
  }

  if (SUPPORTED_TITLE_PATTERNS.some((pattern) => containsPhrase(normalizedTitle, pattern))) {
    return true;
  }

  // Some ATS boards publish compact titles such as "Engineer I". Only accept
  // those when the department supplies a specific software/data signal.
  if (/^(?:associate |junior |senior |staff |principal )?(?:engineer|developer|scientist)(?: [ivx]+|\s*\d+)?$/i.test(title.trim())) {
    return /\b(?:software|data|machine learning|artificial intelligence|security|infrastructure|platform)\b/
      .test(normalizedDepartment);
  }

  return false;
}

export function isTargetJobListing(
  job: Pick<JobListing, "title" | "department">
): boolean {
  return isTargetJobTitle(job.title, job.department);
}

export function isEligibleJobListing(
  job: Pick<JobListing, "title" | "department" | "location" | "postedAt">
): boolean {
  return isUsJobLocation(job.location)
    && isTargetJobListing(job)
    && isFreshPostedAt(job.postedAt);
}

export async function ensureEligibleJobs(db: D1Database): Promise<number> {
  const cleanupVersion = "eligible-jobs-v4";
  const state = await db.prepare(
    "SELECT value FROM preferences WHERE key = 'eligible_jobs_cleanup_version'"
  ).first<{ value: string }>();
  if (state?.value === cleanupVersion) return 0;

  const openJobs = await db.prepare(
    `SELECT j.id, j.title, j.department, j.location, j.posted_at AS postedAt,
            COALESCE(c.source_type, c.ats_type) AS source_type
     FROM jobs j
     JOIN companies c ON c.id = j.company_id
     WHERE j.closed_at IS NULL`
  ).all<{
    id: string;
    title: string;
    department: string | null;
    location: string;
    postedAt: string | null;
    source_type: string;
  }>();

  const normalizedJobs = (openJobs.results ?? []).map((job) => {
    if (job.source_type !== "workday") return job;

    const aggregate = job.location.match(/^(\d+)\s+locations?(?:,\s*united states(?: of america)?)?$/i);
    if (aggregate) return { ...job, location: `${aggregate[1]} US locations` };

    // Older Workday ingestion appended ", United States" to every unknown
    // label. Strip that synthetic suffix before eligibility is evaluated so a
    // value such as "Berlin, United States" cannot survive this migration.
    const suffixed = job.location.match(/^(.+),\s*united states(?: of america)?$/i);
    if (suffixed && !isUsJobLocation(suffixed[1])) {
      return { ...job, location: suffixed[1].trim() };
    }
    return job;
  });

  const changedLocations = normalizedJobs.filter((job, index) =>
    job.location !== openJobs.results?.[index]?.location
  );
  for (let offset = 0; offset < changedLocations.length; offset += 75) {
    await db.batch(changedLocations.slice(offset, offset + 75).map((job) =>
      db.prepare("UPDATE jobs SET location = ? WHERE id = ?").bind(job.location, job.id)
    ));
  }

  const now = new Date().toISOString();
  const rejected = normalizedJobs.filter((job) =>
    !isEligibleJobListing(job)
  );
  for (let offset = 0; offset < rejected.length; offset += 75) {
    await db.batch(rejected.slice(offset, offset + 75).map((job) =>
      db.prepare("UPDATE jobs SET closed_at = ? WHERE id = ? AND closed_at IS NULL")
        .bind(now, job.id)
    ));
  }

  await db.prepare(
    `INSERT INTO preferences (key, value)
     VALUES ('eligible_jobs_cleanup_version', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).bind(cleanupVersion).run();
  return rejected.length;
}
