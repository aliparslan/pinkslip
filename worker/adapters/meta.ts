import type {
  ATSAdapter,
  JobContent,
  JobListing,
  JobReference,
} from "./types";
import { extractSalaryFromHtml } from "./salary";
import { fetchWithTimeout } from "../http";
import {
  hasDisqualifyingJobRequirement,
  isPotentialCatalogJobListing,
  isTargetJobTitle,
} from "../job-scope";
import {
  hasPotentiallyEligibleSeniority,
  parseExperienceRequirement,
} from "../job-features";

const META_SOURCE = "meta";
const META_ORIGIN = "https://www.metacareers.com";
const META_JOB_SITEMAP = `${META_ORIGIN}/jobsearch/sitemap.xml`;
const META_USER_AGENT =
  "Mozilla/5.0 (compatible; PinkslipJobs/1.0; +https://pinkslip.work/support)";
const META_CAREERS_HOSTS = new Set([
  "metacareers.com",
  "www.metacareers.com",
]);
const META_JOB_PATH = /^\/profile\/job_details\/(\d+)\/?$/;
const META_RESULT_SAFETY_LIMIT = 2_000;
const META_SITEMAP_LIMIT_BYTES = 2 * 1024 * 1024;
const META_JOB_HTML_LIMIT_BYTES = 1024 * 1024;
const REQUEST_TIMEOUT_MS = 20_000;
const BODY_TIMEOUT_MS = 20_000;
const UPSTREAM_ATTEMPTS = 2;
const MAX_RETRY_DELAY_MS = 5_000;
const BASE_RETRY_DELAY_MS = 250;
const FULL_SNAPSHOT_CONCURRENCY = 4;
const FULL_SNAPSHOT_SUBREQUEST_BUDGET = 2_500;

interface RequestBudget {
  used: number;
}

interface MetaTextResponse {
  status: number;
  text: string | null;
}

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function requiredString(value: unknown, field: string, externalId: string) {
  const parsed = optionalString(value);
  if (!parsed) throw new Error(`Meta job ${externalId} is missing ${field}`);
  return parsed;
}

function decodeMarkupEntities(value: string) {
  return value.replace(
    /&(?:amp|quot|apos|lt|gt|#39|#x27);/gi,
    (entity) => {
      switch (entity.toLowerCase()) {
        case "&amp;": return "&";
        case "&quot;": return '"';
        case "&apos;":
        case "&#39;":
        case "&#x27;": return "'";
        case "&lt;": return "<";
        case "&gt;": return ">";
        default: return entity;
      }
    }
  );
}

export function normalizeMetaSource(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error("Meta Careers source is required");
  if (trimmed.toLowerCase() === META_SOURCE) return META_SOURCE;

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error(
      'Meta Careers source must be "meta" or a metacareers.com URL'
    );
  }

  if (
    url.protocol !== "https:"
    || !META_CAREERS_HOSTS.has(url.hostname.toLowerCase())
    || url.port
    || url.username
    || url.password
  ) {
    throw new Error("Meta Careers source URL must use HTTPS metacareers.com");
  }

  return META_SOURCE;
}

function canonicalJobReference(value: string, expectedId?: string): JobReference {
  let url: URL;
  try {
    url = new URL(decodeMarkupEntities(value));
  } catch {
    throw new Error("Meta Careers returned an invalid job URL");
  }
  const pathMatch = META_JOB_PATH.exec(url.pathname);
  if (
    url.protocol !== "https:"
    || url.origin !== META_ORIGIN
    || url.username
    || url.password
    || url.search
    || url.hash
    || !pathMatch
  ) {
    throw new Error("Meta Careers returned a job URL outside its public job path");
  }
  const externalId = pathMatch[1];
  if (expectedId !== undefined && externalId !== expectedId) {
    throw new Error(`Meta job URL did not match public ID ${expectedId}`);
  }
  return {
    externalId,
    url: `${META_ORIGIN}/profile/job_details/${externalId}/`,
  };
}

export function parseMetaJobSitemap(xml: string): JobReference[] {
  if (!/<urlset\b[^>]*>/i.test(xml) || !/<\/urlset>\s*$/i.test(xml)) {
    throw new Error("Meta Careers returned an invalid job sitemap");
  }

  const references: JobReference[] = [];
  const seen = new Set<string>();
  const urlPattern = /<url\b[^>]*>[\s\S]*?<loc\b[^>]*>([\s\S]*?)<\/loc>[\s\S]*?<\/url>/gi;
  for (const match of xml.matchAll(urlPattern)) {
    const location = match[1]?.trim();
    if (!location) throw new Error("Meta Careers job sitemap contains an empty URL");
    const reference = canonicalJobReference(location);
    if (seen.has(reference.externalId)) {
      throw new Error(
        `Meta Careers job sitemap repeated public ID ${reference.externalId}`
      );
    }
    seen.add(reference.externalId);
    references.push(reference);
    if (references.length > META_RESULT_SAFETY_LIMIT) {
      throw new Error(
        `Meta Careers exceeded the ${META_RESULT_SAFETY_LIMIT}-job safety limit`
      );
    }
  }

  if (references.length === 0) {
    throw new Error("Meta Careers returned an empty job sitemap");
  }
  const locCount = [...xml.matchAll(/<loc\b[^>]*>/gi)].length;
  if (locCount !== references.length) {
    throw new Error("Meta Careers job sitemap contains an unsupported URL entry");
  }
  return references;
}

async function cancelResponseBody(response: Response) {
  if (!response.body) return;
  await response.body.cancel().catch(() => undefined);
}

async function readBoundedText(
  response: Response,
  context: string,
  allowedContentType: RegExp,
  limitBytes: number,
  timeoutMs = BODY_TIMEOUT_MS
) {
  const contentType = response.headers.get("content-type");
  if (contentType && !allowedContentType.test(contentType)) {
    await cancelResponseBody(response);
    throw new Error(`Meta Careers returned ${contentType} for ${context}`);
  }

  const contentLength = response.headers.get("content-length");
  if (contentLength !== null) {
    const advertised = Number(contentLength);
    if (
      !Number.isSafeInteger(advertised)
      || advertised < 0
      || advertised > limitBytes
    ) {
      await cancelResponseBody(response);
      throw new Error(`Meta Careers ${context} exceeded ${limitBytes} bytes`);
    }
  }
  if (!response.body) {
    throw new Error(`Meta Careers returned an empty response for ${context}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let received = 0;
  let text = "";
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timeout = setTimeout(
      () => reject(new Error(
        `Meta Careers ${context} body timed out after ${timeoutMs}ms`
      )),
      timeoutMs
    );
  });

  try {
    while (true) {
      const chunk = await Promise.race([reader.read(), deadline]);
      if (chunk.done) break;
      received += chunk.value.byteLength;
      if (received > limitBytes) {
        throw new Error(`Meta Careers ${context} exceeded ${limitBytes} bytes`);
      }
      text += decoder.decode(chunk.value, { stream: true });
    }
    return text + decoder.decode();
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
    reader.releaseLock();
  }
}

function isTransientStatus(status: number) {
  return status === 408
    || status === 425
    || status === 429
    || (status >= 500 && status <= 599);
}

export function metaRetryDelayMs(
  retryAfter: string | null,
  attempt: number,
  nowMs = Date.now()
) {
  if (retryAfter !== null) {
    const trimmed = retryAfter.trim();
    if (/^\d+(?:\.\d+)?$/.test(trimmed)) {
      return Math.min(MAX_RETRY_DELAY_MS, Math.max(0, Number(trimmed) * 1_000));
    }
    const retryAt = Date.parse(trimmed);
    if (Number.isFinite(retryAt)) {
      return Math.min(MAX_RETRY_DELAY_MS, Math.max(0, retryAt - nowMs));
    }
  }
  return Math.min(
    MAX_RETRY_DELAY_MS,
    BASE_RETRY_DELAY_MS * (2 ** Math.max(0, attempt - 1))
  );
}

function waitForRetry(delayMs: number) {
  return delayMs > 0
    ? new Promise<void>((resolve) => setTimeout(resolve, delayMs))
    : Promise.resolve();
}

async function fetchMetaText(
  url: string,
  context: string,
  allowedContentType: RegExp,
  limitBytes: number,
  budget?: RequestBudget
): Promise<MetaTextResponse> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= UPSTREAM_ATTEMPTS; attempt += 1) {
    if (budget) {
      if (budget.used >= FULL_SNAPSHOT_SUBREQUEST_BUDGET) {
        throw new Error(
          `Meta Careers exhausted its ${FULL_SNAPSHOT_SUBREQUEST_BUDGET}-subrequest snapshot budget`
        );
      }
      budget.used += 1;
    }

    let response: Response;
    try {
      response = await fetchWithTimeout(url, {
        headers: {
          accept: context === "job sitemap"
            ? "application/xml,text/xml;q=0.9"
            : "text/html,application/xhtml+xml;q=0.9",
          "accept-language": "en-US,en;q=0.9",
          // Cloudflare's default Worker UA is redirected to Facebook's
          // unsupported-browser page. Identify this crawler transparently
          // while retaining a browser-compatible product token.
          "user-agent": META_USER_AGENT,
        },
      }, REQUEST_TIMEOUT_MS);
    } catch (error) {
      lastError = error;
      if (attempt === UPSTREAM_ATTEMPTS) {
        throw new Error(
          `Meta Careers ${context} request failed after ${UPSTREAM_ATTEMPTS} attempts`,
          { cause: error }
        );
      }
      await waitForRetry(metaRetryDelayMs(null, attempt));
      continue;
    }

    lastError = undefined;
    if (response.ok) {
      return {
        status: response.status,
        text: await readBoundedText(
          response,
          context,
          allowedContentType,
          limitBytes
        ),
      };
    }

    const retryable = isTransientStatus(response.status);
    const delay = metaRetryDelayMs(response.headers.get("retry-after"), attempt);
    await cancelResponseBody(response);
    if (!retryable || attempt === UPSTREAM_ATTEMPTS) {
      return { status: response.status, text: null };
    }
    await waitForRetry(delay);
  }
  throw new Error(`Meta Careers ${context} request failed`, { cause: lastError });
}

async function fetchMetaJobReferences(budget?: RequestBudget) {
  const response = await fetchMetaText(
    META_JOB_SITEMAP,
    "job sitemap",
    // Meta's edge currently labels this XML document as text/html from some
    // Cloudflare colos. The strict urlset/body parser below still rejects an
    // HTML challenge or any content outside the canonical public job paths.
    /^(?:(?:application|text)\/xml|text\/html)\b/i,
    META_SITEMAP_LIMIT_BYTES,
    budget
  );
  if (response.text === null) {
    throw new Error(`Meta Careers job sitemap returned HTTP ${response.status}`);
  }
  return parseMetaJobSitemap(response.text);
}

function htmlAttribute(tag: string, name: string): string | null {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(
    `\\b${escaped}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`,
    "i"
  ).exec(tag);
  return match ? decodeMarkupEntities(match[1] ?? match[2] ?? "") : null;
}

function canonicalReferenceFromHtml(html: string, externalId: string) {
  for (const match of html.matchAll(/<link\b[^>]*>/gi)) {
    const rel = htmlAttribute(match[0], "rel");
    if (!rel?.split(/\s+/).some((value) => value.toLowerCase() === "canonical")) {
      continue;
    }
    const href = htmlAttribute(match[0], "href");
    if (!href) throw new Error(`Meta job ${externalId} has an empty canonical URL`);
    return canonicalJobReference(href, externalId);
  }
  throw new Error(`Meta job ${externalId} is missing its canonical URL`);
}

function hasJobPostingType(value: JsonRecord) {
  const type = value["@type"];
  return type === "JobPosting"
    || (Array.isArray(type) && type.includes("JobPosting"));
}

function collectJobPostings(value: unknown, postings: JsonRecord[]) {
  if (Array.isArray(value)) {
    for (const entry of value) collectJobPostings(entry, postings);
    return;
  }
  if (!isRecord(value)) return;
  if (hasJobPostingType(value)) postings.push(value);
  if (Array.isArray(value["@graph"])) {
    collectJobPostings(value["@graph"], postings);
  }
}

export function extractMetaJobPosting(html: string, externalId: string): JsonRecord {
  canonicalReferenceFromHtml(html, externalId);
  const postings: JsonRecord[] = [];
  const openingPattern = /<script\b[^>]*>/gi;
  for (const opening of html.matchAll(openingPattern)) {
    const type = htmlAttribute(opening[0], "type");
    if (type?.toLowerCase() !== "application/ld+json") continue;
    const contentStart = (opening.index ?? 0) + opening[0].length;
    const contentEnd = html.indexOf("</script>", contentStart);
    if (contentEnd < 0) {
      throw new Error(`Meta job ${externalId} has unterminated structured data`);
    }
    const raw = html.slice(contentStart, contentEnd).trim();
    if (!raw) continue;
    try {
      collectJobPostings(JSON.parse(raw), postings);
    } catch {
      throw new Error(`Meta job ${externalId} has invalid structured data`);
    }
  }
  if (postings.length !== 1) {
    throw new Error(
      `Meta job ${externalId} returned ${postings.length} JobPosting records`
    );
  }
  return postings[0];
}

function metaPageTitle(html: string, externalId: string) {
  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    if (htmlAttribute(match[0], "name")?.toLowerCase() !== "title") continue;
    const title = htmlAttribute(match[0], "content");
    if (title) return title;
  }
  throw new Error(`Meta job ${externalId} is missing both JobPosting data and a title`);
}

function metaPageDescription(html: string) {
  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    if (htmlAttribute(match[0], "name")?.toLowerCase() !== "description") continue;
    return htmlAttribute(match[0], "content");
  }
  return null;
}

function outOfScopeFallbackListing(
  html: string,
  reference: JobReference
): JobListing | null {
  canonicalReferenceFromHtml(html, reference.externalId);
  const title = metaPageTitle(html, reference.externalId);
  const summary = metaPageDescription(html);
  if (/^(?:not logged in|meta careers|page not found)$/i.test(title)) return null;
  const explicitSeniorRole = summary !== null
    && /\b(?:staff|senior|sr\.?|principal|lead)\s+(?:[a-z]+\s+){0,3}(?:engineer|developer|scientist|researcher|architect)\b/i
      .test(summary);
  const minimumYears = parseExperienceRequirement(title, summary).min;
  if (
    hasPotentiallyEligibleSeniority(title)
    && isTargetJobTitle(title)
    && !hasDisqualifyingJobRequirement({ title, description: summary })
    && !explicitSeniorRole
    && (minimumYears === null || minimumYears <= 3)
  ) return null;
  return {
    externalId: reference.externalId,
    title,
    url: reference.url,
    // The public page has enough information to prove this role is outside the
    // fixed audience, but not enough to claim a location or posting date.
    location: "Unspecified",
    department: null,
    postedAt: null,
    description: null,
    salary: null,
  };
}

function normalizedPostedAt(value: unknown, externalId: string) {
  const postedAt = requiredString(value, "datePosted", externalId);
  const parsed = new Date(postedAt);
  if (!Number.isFinite(parsed.getTime())) {
    throw new Error(`Meta job ${externalId} has an invalid datePosted`);
  }
  return parsed.toISOString();
}

function countryName(value: unknown): string | null {
  if (isRecord(value)) return optionalString(value.name);
  return optionalString(value);
}

function isUnitedStates(value: unknown) {
  const normalized = countryName(value)?.toLowerCase().replace(/[^a-z]/g, "");
  return normalized === "us"
    || normalized === "usa"
    || normalized === "unitedstates"
    || normalized === "unitedstatesofamerica";
}

function asRecords(value: unknown): JsonRecord[] {
  if (Array.isArray(value)) return value.filter(isRecord);
  return isRecord(value) ? [value] : [];
}

function uniqueLocations(values: string[]) {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = value.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function placeName(place: JsonRecord) {
  const named = optionalString(place.name);
  if (named) return named;
  const address = isRecord(place.address) ? place.address : null;
  if (!address) return null;
  return [
    optionalString(address.addressLocality),
    optionalString(address.addressRegion),
    countryName(address.addressCountry),
  ].filter((value): value is string => Boolean(value)).join(", ") || null;
}

function metaLocation(posting: JsonRecord, externalId: string) {
  const allLocations: string[] = [];
  const usLocations: string[] = [];
  for (const place of asRecords(posting.jobLocation)) {
    const name = placeName(place);
    if (!name) continue;
    allLocations.push(name);
    const address = isRecord(place.address) ? place.address : null;
    if (address && isUnitedStates(address.addressCountry)) usLocations.push(name);
  }

  const remote = optionalString(posting.jobLocationType)?.toUpperCase()
    === "TELECOMMUTE";
  const remoteInUs = remote && asRecords(posting.applicantLocationRequirements)
    .some((requirement) => isUnitedStates(requirement.name));
  if (remoteInUs) usLocations.unshift("Remote, US");

  const selected = uniqueLocations(
    usLocations.length > 0 ? usLocations : allLocations
  );
  if (selected.length === 0) {
    throw new Error(`Meta job ${externalId} is missing structured locations`);
  }
  return selected.join(" / ");
}

function descriptionSection(title: string, value: unknown) {
  const content = optionalString(value);
  return content ? `<h2>${title}</h2>${content}` : null;
}

function metaDescription(posting: JsonRecord, externalId: string) {
  const description = [
    descriptionSection("About the job", posting.description),
    descriptionSection("Responsibilities", posting.responsibilities),
    descriptionSection("Qualifications", posting.qualifications),
  ].filter((value): value is string => Boolean(value)).join("\n");
  if (!description) throw new Error(`Meta job ${externalId} is missing description`);
  return description;
}

function validateHiringOrganization(posting: JsonRecord, externalId: string) {
  const organization = isRecord(posting.hiringOrganization)
    ? posting.hiringOrganization
    : null;
  const name = organization ? optionalString(organization.name) : null;
  if (!name || !/^meta(?: platforms,? inc\.?)?$/i.test(name)) {
    throw new Error(`Meta job ${externalId} has an unexpected hiring organization`);
  }
}

export function mapMetaJobPosting(
  posting: JsonRecord,
  reference: JobReference,
  retainDescription = false
): JobListing {
  validateHiringOrganization(posting, reference.externalId);
  const title = requiredString(posting.title, "title", reference.externalId);
  const location = metaLocation(posting, reference.externalId);
  const postedAt = normalizedPostedAt(posting.datePosted, reference.externalId);
  const fullDescription = metaDescription(posting, reference.externalId);
  const preliminary = {
    externalId: reference.externalId,
    title,
    url: reference.url,
    location,
    department: null,
    postedAt,
    description: null,
    salary: null,
  } satisfies JobListing;
  const description = retainDescription
    || isPotentialCatalogJobListing(preliminary)
      ? fullDescription
      : null;
  return {
    ...preliminary,
    description,
    salary: description ? extractSalaryFromHtml(description) : null,
  };
}

async function fetchMetaJob(
  reference: JobReference,
  budget?: RequestBudget,
  retainDescription = false
): Promise<JobListing | null> {
  const response = await fetchMetaText(
    reference.url,
    `job ${reference.externalId}`,
    /^text\/html\b/i,
    META_JOB_HTML_LIMIT_BYTES,
    budget
  );
  if (response.status === 404 || response.status === 410) return null;
  if (response.text === null) {
    throw new Error(
      `Meta Careers job ${reference.externalId} returned HTTP ${response.status}`
    );
  }
  let posting: JsonRecord;
  try {
    posting = extractMetaJobPosting(response.text, reference.externalId);
  } catch (error) {
    if (
      error instanceof Error
      && error.message === `Meta job ${reference.externalId} returned 0 JobPosting records`
    ) {
      const fallback = outOfScopeFallbackListing(response.text, reference);
      if (fallback) return fallback;
    }
    throw error;
  }
  return mapMetaJobPosting(posting, reference, retainDescription);
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>
) {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  let failure: unknown;

  async function runNext(): Promise<void> {
    while (failure === undefined) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      try {
        results[index] = await worker(items[index]);
      } catch (error) {
        failure = error;
      }
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.max(1, Math.min(limit, items.length)) },
      () => runNext()
    )
  );
  if (failure !== undefined) throw failure;
  return results;
}

async function fetchMetaSnapshot() {
  const budget: RequestBudget = { used: 0 };
  const initialReferences = await fetchMetaJobReferences(budget);
  const initialJobs = await mapWithConcurrency(
    initialReferences,
    FULL_SNAPSHOT_CONCURRENCY,
    (reference) => fetchMetaJob(reference, budget)
  );
  const jobs = new Map<string, JobListing>();
  for (const job of initialJobs) {
    if (job) jobs.set(job.externalId, job);
  }

  // The sitemap is regenerated as one live set. Re-read it after the detail
  // crawl and hydrate any IDs that appeared during the pass. Retaining an ID
  // removed during the pass is conservative for closure detection and avoids
  // falsely closing a role because the board changed mid-crawl.
  const currentReferences = await fetchMetaJobReferences(budget);
  const additions = currentReferences.filter(
    (reference) => !jobs.has(reference.externalId)
  );
  const addedJobs = await mapWithConcurrency(
    additions,
    FULL_SNAPSHOT_CONCURRENCY,
    (reference) => fetchMetaJob(reference, budget)
  );
  for (const job of addedJobs) {
    if (job) jobs.set(job.externalId, job);
  }
  const unresolved = currentReferences.filter(
    (reference) => !jobs.has(reference.externalId)
  );
  if (unresolved.length > 0) {
    throw new Error(
      `Meta Careers could not resolve ${unresolved.length} job sitemap entr${
        unresolved.length === 1 ? "y" : "ies"
      }`
    );
  }
  return [...jobs.values()];
}

export class MetaAdapter implements ATSAdapter {
  readonly name = "meta";

  async fetchDiscoveryJobReferences(value: string): Promise<JobReference[]> {
    normalizeMetaSource(value);
    return fetchMetaJobReferences();
  }

  async fetchJobListing(
    value: string,
    externalId: string,
    jobUrl?: string
  ): Promise<JobListing> {
    normalizeMetaSource(value);
    if (!/^\d+$/.test(externalId)) {
      throw new Error(`Meta job returned unsafe public ID ${externalId}`);
    }
    const reference = canonicalJobReference(
      jobUrl ?? `${META_ORIGIN}/profile/job_details/${externalId}/`,
      externalId
    );
    const listing = await fetchMetaJob(reference);
    if (!listing) throw new Error(`Meta job ${externalId} is no longer available`);
    return listing;
  }

  async fetchJobs(value: string): Promise<JobListing[]> {
    normalizeMetaSource(value);
    return fetchMetaSnapshot();
  }

  async fetchJobContent(
    value: string,
    externalId: string,
    jobUrl?: string
  ): Promise<JobContent> {
    normalizeMetaSource(value);
    if (!/^\d+$/.test(externalId)) {
      throw new Error(`Meta job returned unsafe public ID ${externalId}`);
    }
    const reference = canonicalJobReference(
      jobUrl ?? `${META_ORIGIN}/profile/job_details/${externalId}/`,
      externalId
    );
    const listing = await fetchMetaJob(reference, undefined, true);
    if (!listing) return { description: null, salary: null };
    return {
      description: listing.description,
      salary: listing.salary,
      location: listing.location,
      postedAt: listing.postedAt,
    };
  }
}
