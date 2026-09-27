import type { ATSAdapter, JobContent, JobListing } from "./types";
import { extractSalaryFromHtml } from "./salary";
import { fetchWithTimeout } from "../http";
import { isPotentialCatalogJobListing } from "../job-scope";

const AMAZON_ORIGIN = "https://www.amazon.jobs";
const AMAZON_SOURCE = "amazon";
const PAGE_SIZE = 100;
const PAGE_CONCURRENCY = 2;
const CATEGORY_SNAPSHOT_ATTEMPTS = 3;
const AMAZON_RESULT_CAP = 10_000;

// These are the existing software/data/science families Pinkslip already
// targets. Keeping the query category-scoped avoids Amazon's 10,000-result cap
// for its complete US inventory while leaving title/seniority decisions to the
// shared job-scope and matching policies.
const AMAZON_TECH_CATEGORIES = [
  "Software Development",
  "Applied Science",
  "Machine Learning Science",
  "Data Science",
  "Research Science",
  "Business Intelligence",
  "Database Administration",
  "Systems, Quality, & Security Engineering",
  "Solutions Architect",
] as const;
const AMAZON_TECH_CATEGORY_SET = new Set<string>(AMAZON_TECH_CATEGORIES);

interface AmazonSearchPage {
  total: number;
  jobs: Record<string, unknown>[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function requiredString(
  posting: Record<string, unknown>,
  field: string,
  context: string
) {
  const value = optionalString(posting[field]);
  if (!value) throw new Error(`Amazon job ${context} is missing ${field}`);
  return value;
}

export function normalizeAmazonSource(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error("Amazon source is required");
  if (trimmed.toLowerCase() === AMAZON_SOURCE) return AMAZON_SOURCE;

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error('Amazon source must be "amazon" or an amazon.jobs URL');
  }

  if (
    url.protocol !== "https:"
    || !["amazon.jobs", "www.amazon.jobs"].includes(url.hostname.toLowerCase())
  ) {
    throw new Error("Amazon source URL must use HTTPS amazon.jobs");
  }
  return AMAZON_SOURCE;
}

function searchUrl(category: string, offset: number) {
  const url = new URL("/en/search.json", AMAZON_ORIGIN);
  url.searchParams.append("category[]", category);
  // Amazon expects a scalar country parameter and bracketed category params.
  // Similar-looking alternatives are accepted but silently ignored upstream.
  url.searchParams.append("normalized_country_code[]", "USA");
  url.searchParams.set("offset", String(offset));
  url.searchParams.set("result_limit", String(PAGE_SIZE));
  url.searchParams.set("sort", "recent");
  return url;
}

function detailSearchUrl(externalId: string) {
  const url = new URL("/en/search.json", AMAZON_ORIGIN);
  url.searchParams.set("base_query", externalId);
  url.searchParams.append("normalized_country_code[]", "USA");
  url.searchParams.set("offset", "0");
  url.searchParams.set("result_limit", "10");
  return url;
}

function parseSearchPage(payload: unknown, context: string): AmazonSearchPage {
  if (!isRecord(payload)) {
    throw new Error(`Amazon Jobs returned an unexpected payload for ${context}`);
  }
  const total = payload.hits;
  const jobs = payload.jobs;
  if (
    (payload.error !== null && payload.error !== undefined)
    || typeof total !== "number"
    || !Number.isSafeInteger(total)
    || total < 0
    || !Array.isArray(jobs)
    || !jobs.every(isRecord)
  ) {
    throw new Error(`Amazon Jobs returned an unexpected payload for ${context}`);
  }
  return { total, jobs };
}

async function fetchSearchPage(
  category: string,
  offset: number
): Promise<AmazonSearchPage> {
  const response = await fetchWithTimeout(searchUrl(category, offset), {
    headers: { accept: "application/json" },
  });
  if (!response.ok) throw new Error(`Amazon Jobs API ${response.status}`);
  return parseSearchPage(
    await response.json(),
    `${category} offset ${offset}`
  );
}

function amazonExternalId(posting: Record<string, unknown>) {
  const value = posting.id_icims;
  if (typeof value === "number" && Number.isSafeInteger(value)) return String(value);
  return requiredString(posting, "id_icims", "with unknown ID");
}

function amazonJobUrl(posting: Record<string, unknown>, externalId: string) {
  const rawPath = requiredString(posting, "job_path", externalId);
  const url = new URL(rawPath, AMAZON_ORIGIN);
  const pathParts = url.pathname.split("/").filter(Boolean);
  if (
    url.protocol !== "https:"
    || url.hostname !== "www.amazon.jobs"
    || pathParts[0] !== "en"
    || pathParts[1] !== "jobs"
    || pathParts[2] !== externalId
  ) {
    throw new Error(`Amazon job ${externalId} returned an unsafe job path`);
  }
  return url.toString();
}

function amazonDescription(posting: Record<string, unknown>) {
  const description = optionalString(posting.description);
  const basic = optionalString(posting.basic_qualifications);
  const preferred = optionalString(posting.preferred_qualifications);
  const sections = [
    description,
    basic ? `<h2>Basic qualifications</h2>${basic}` : null,
    preferred ? `<h2>Preferred qualifications</h2>${preferred}` : null,
  ].filter((section): section is string => Boolean(section));
  return sections.join("\n") || null;
}

function parseAmazonLocation(value: unknown) {
  if (typeof value !== "string") return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return null;
  }
  if (!isRecord(parsed)) return null;

  const country = optionalString(parsed.countryIso3a)
    ?? optionalString(parsed.normalizedCountryCode)
    ?? optionalString(parsed.countryIso2a);
  if (country && !["USA", "US"].includes(country.toUpperCase())) return null;
  const location = optionalString(parsed.location)
    ?? optionalString(parsed.locationNonStemming)
    ?? optionalString(parsed.normalizedLocation);
  if (!location) return null;
  const workMode = optionalString(parsed.type)?.toUpperCase();
  return workMode === "VIRTUAL" && !/\b(?:remote|virtual)\b/i.test(location)
    ? `Remote, ${location}`
    : location;
}

function amazonLocation(posting: Record<string, unknown>, externalId: string) {
  const locations = Array.isArray(posting.locations)
    ? posting.locations.map(parseAmazonLocation).filter((value): value is string => Boolean(value))
    : [];
  const seen = new Set<string>();
  const unique = locations.filter((location) => {
    const key = location.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (unique.length > 0) return unique.join(" / ");

  const countryCode = optionalString(posting.country_code)?.toUpperCase();
  if (countryCode && !["USA", "US"].includes(countryCode)) {
    throw new Error(`Amazon job ${externalId} escaped the configured US filter`);
  }
  return optionalString(posting.normalized_location)
    ?? optionalString(posting.location)
    ?? "United States";
}

const MONTHS = new Map([
  ["january", 0], ["february", 1], ["march", 2], ["april", 3],
  ["may", 4], ["june", 5], ["july", 6], ["august", 7],
  ["september", 8], ["october", 9], ["november", 10], ["december", 11],
]);

function amazonPostedAt(value: unknown) {
  const raw = optionalString(value);
  if (!raw) return null;
  const match = raw.match(/^([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})$/);
  if (!match) return /^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(raw) ? raw : null;
  const month = MONTHS.get(match[1].toLowerCase());
  const day = Number(match[2]);
  const year = Number(match[3]);
  if (month === undefined || day < 1 || day > 31) return null;
  return new Date(Date.UTC(year, month, day)).toISOString();
}

function mapAmazonPosting(
  posting: Record<string, unknown>,
  expectedCategory?: string,
  retainDescription = false
): JobListing {
  const externalId = amazonExternalId(posting);
  const title = requiredString(posting, "title", externalId);
  const department = requiredString(posting, "job_category", externalId);
  if (
    !AMAZON_TECH_CATEGORY_SET.has(department)
    || (expectedCategory !== undefined && department !== expectedCategory)
  ) {
    throw new Error(
      `Amazon job ${externalId} escaped the configured category filter${
        expectedCategory ? ` ${expectedCategory}` : "s"
      } (${department})`
    );
  }
  const location = amazonLocation(posting, externalId);
  const postedAt = amazonPostedAt(posting.posted_date);
  // Keep the complete ID/title/location snapshot for trustworthy closure
  // tracking, but do not retain megabytes of HTML for globally out-of-scope
  // or stale rows. A user custom title can still admit one and hydrate it by
  // public ID, while stale rows still participate in absence tracking.
  const description = retainDescription || isPotentialCatalogJobListing({
    title,
    department,
    location,
    postedAt,
  })
    ? amazonDescription(posting)
    : null;
  return {
    externalId,
    title,
    url: amazonJobUrl(posting, externalId),
    location,
    department,
    postedAt,
    description,
    salary: extractSalaryFromHtml(description),
  };
}

class AmazonSnapshotConsistencyError extends Error {}

async function fetchAmazonCategoryOnce(category: string) {
  const firstPage = await fetchSearchPage(category, 0);
  if (firstPage.total === 0) {
    if (firstPage.jobs.length !== 0) {
      throw new AmazonSnapshotConsistencyError(
        `Amazon Jobs ${category} returned ${firstPage.jobs.length} jobs for a zero-result snapshot`
      );
    }
    return [];
  }
  if (firstPage.total >= AMAZON_RESULT_CAP) {
    throw new Error(
      `Amazon Jobs reached its ${AMAZON_RESULT_CAP}-job result cap for ${category}`
    );
  }

  const offsets: number[] = [];
  for (let offset = PAGE_SIZE; offset < firstPage.total; offset += PAGE_SIZE) {
    offsets.push(offset);
  }

  let rawPostingCount = firstPage.jobs.length;
  const unique = new Map<string, JobListing>();
  for (const posting of firstPage.jobs) {
    const listing = mapAmazonPosting(posting, category);
    if (unique.has(listing.externalId)) {
      throw new AmazonSnapshotConsistencyError(
        `Amazon Jobs ${category} returned duplicate public ID ${listing.externalId}`
      );
    }
    unique.set(listing.externalId, listing);
  }
  for (let index = 0; index < offsets.length; index += PAGE_CONCURRENCY) {
    const pages = await Promise.all(
      offsets.slice(index, index + PAGE_CONCURRENCY).map((offset) =>
        fetchSearchPage(category, offset)
      )
    );
    for (const page of pages) {
      if (page.total !== firstPage.total) {
        throw new AmazonSnapshotConsistencyError(
          `Amazon Jobs ${category} result count changed during pagination (${firstPage.total} to ${page.total})`
        );
      }
      rawPostingCount += page.jobs.length;
      for (const posting of page.jobs) {
        const listing = mapAmazonPosting(posting, category);
        if (unique.has(listing.externalId)) {
          throw new AmazonSnapshotConsistencyError(
            `Amazon Jobs ${category} returned duplicate public ID ${listing.externalId}`
          );
        }
        unique.set(listing.externalId, listing);
      }
    }
  }

  if (rawPostingCount !== firstPage.total) {
    throw new AmazonSnapshotConsistencyError(
      `Amazon Jobs ${category} returned ${rawPostingCount} of ${firstPage.total} expected jobs`
    );
  }
  return [...unique.values()];
}

async function fetchAmazonCategory(category: string) {
  let lastError: AmazonSnapshotConsistencyError | null = null;
  for (let attempt = 1; attempt <= CATEGORY_SNAPSHOT_ATTEMPTS; attempt += 1) {
    try {
      return await fetchAmazonCategoryOnce(category);
    } catch (error) {
      if (!(error instanceof AmazonSnapshotConsistencyError)) throw error;
      lastError = error;
    }
  }

  throw new Error(
    `Amazon Jobs ${category} snapshot did not stabilize after ${CATEGORY_SNAPSHOT_ATTEMPTS} attempts: ${
      lastError?.message ?? "unknown consistency error"
    }`
  );
}

async function fetchAllAmazonJobs() {
  const unique = new Map<string, JobListing>();
  for (const category of AMAZON_TECH_CATEGORIES) {
    const jobs = await fetchAmazonCategory(category);
    for (const job of jobs) {
      if (unique.has(job.externalId)) {
        throw new Error(
          `Amazon Jobs returned duplicate public ID ${job.externalId} across categories`
        );
      }
      unique.set(job.externalId, job);
    }
  }
  return [...unique.values()];
}

export class AmazonAdapter implements ATSAdapter {
  readonly name = "amazon";

  async fetchJobs(value: string): Promise<JobListing[]> {
    normalizeAmazonSource(value);
    return fetchAllAmazonJobs();
  }

  async fetchJobContent(
    value: string,
    externalId: string
  ): Promise<JobContent> {
    normalizeAmazonSource(value);
    const response = await fetchWithTimeout(detailSearchUrl(externalId), {
      headers: { accept: "application/json" },
    });
    if (!response.ok) return { description: null, salary: null };

    const page = parseSearchPage(await response.json(), `job ${externalId}`);
    const posting = page.jobs.find((candidate) => {
      try {
        return amazonExternalId(candidate) === externalId;
      } catch {
        return false;
      }
    });
    if (!posting) return { description: null, salary: null };

    const listing = mapAmazonPosting(posting, undefined, true);
    return {
      description: listing.description,
      salary: listing.salary,
      location: listing.location,
      postedAt: listing.postedAt,
    };
  }
}
