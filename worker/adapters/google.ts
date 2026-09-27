import type { ATSAdapter, JobContent, JobListing } from "./types";
import { extractSalaryFromHtml } from "./salary";
import { fetchWithTimeout } from "../http";
import { isPotentialCatalogJobListing } from "../job-scope";

const GOOGLE_ORIGIN = "https://www.google.com";
const GOOGLE_SOURCE = "google";
const GOOGLE_RESULTS_PATH = "/about/careers/applications/jobs/results/";
const GOOGLE_LOCALE = "en_US";
const GOOGLE_LOCATION = "United States";
const GOOGLE_COMPANY = "Google";
const PAGE_CONCURRENCY = 2;
const SNAPSHOT_ATTEMPTS = 3;
const UPSTREAM_ATTEMPTS = 3;
const REQUEST_TIMEOUT_MS = 15_000;
const BODY_TIMEOUT_MS = 15_000;
const BASE_RETRY_DELAY_MS = 250;
const MAX_RETRY_DELAY_MS = 5_000;
const MAX_PAGE_SIZE = 100;
const GOOGLE_RESULT_SAFETY_LIMIT = 5_000;
const LIST_SUBREQUEST_BUDGET = 900;
export const GOOGLE_DISCOVERY_PAGE_LIMIT = 5;
export const GOOGLE_MAX_HTML_BYTES = 2_500_000;

interface GoogleSearchPage {
  total: number;
  pageSize: number;
  jobs: unknown[][];
}

interface InitData {
  data: unknown;
  errorHasStatus: boolean;
}

interface ListRequestBudget {
  used: number;
}

class GoogleSnapshotConsistencyError extends Error {}
class GoogleBodyTimeoutError extends Error {}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function requiredString(value: unknown, field: string, context: string): string {
  const parsed = optionalString(value);
  if (!parsed) throw new Error(`Google job ${context} is missing ${field}`);
  return parsed;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function normalizeGoogleCareersSource(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error("Google Careers source is required");
  if (trimmed.toLowerCase() === GOOGLE_SOURCE) return GOOGLE_SOURCE;

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error(
      'Google Careers source must be "google" or an official Google Careers URL'
    );
  }

  const currentPath = GOOGLE_RESULTS_PATH.slice(0, -1);
  const current = url.origin === GOOGLE_ORIGIN
    && (url.pathname === currentPath || url.pathname.startsWith(`${currentPath}/`));
  const legacyPath = "/jobs/results";
  const legacy = url.hostname.toLowerCase() === "careers.google.com"
    && (url.pathname === legacyPath || url.pathname.startsWith(`${legacyPath}/`));
  if (
    url.protocol !== "https:"
    || url.username
    || url.password
    || (!current && !legacy)
  ) {
    throw new Error("Google Careers source URL must use an official HTTPS jobs results path");
  }
  return GOOGLE_SOURCE;
}

function googleSearchUrl(page: number) {
  const url = new URL(GOOGLE_RESULTS_PATH, GOOGLE_ORIGIN);
  url.searchParams.set("hl", GOOGLE_LOCALE);
  url.searchParams.set("location", GOOGLE_LOCATION);
  // The unfiltered portal also includes separate Alphabet employers (Waymo,
  // Verily, Wing, DeepMind, GFiber, and YouTube). Pinkslip stores one canonical
  // company per source, so use Google's own employer filter rather than
  // mislabelling those listings as Google jobs.
  url.searchParams.set("company", GOOGLE_COMPANY);
  url.searchParams.set("sort_by", "date");
  url.searchParams.set("page", String(page));
  return url;
}

function googleDetailUrl(externalId: string) {
  if (!/^\d+$/.test(externalId)) {
    throw new Error(`Google job returned unsafe public ID ${externalId}`);
  }
  const url = new URL(`${GOOGLE_RESULTS_PATH}${externalId}`, GOOGLE_ORIGIN);
  url.searchParams.set("hl", GOOGLE_LOCALE);
  return url;
}

async function cancelResponseBody(response: Response) {
  if (!response.body) return;
  await response.body.cancel().catch(() => undefined);
}

export async function readBoundedGoogleCareersHtml(
  response: Response,
  context: string,
  timeoutMs = BODY_TIMEOUT_MS
) {
  const contentType = response.headers.get("content-type");
  if (contentType && !/^text\/html\b/i.test(contentType)) {
    await cancelResponseBody(response);
    throw new Error(`Google Careers returned ${contentType} for ${context}`);
  }

  const contentLength = response.headers.get("content-length");
  if (contentLength !== null) {
    const advertised = Number(contentLength);
    if (
      !Number.isSafeInteger(advertised)
      || advertised < 0
      || advertised > GOOGLE_MAX_HTML_BYTES
    ) {
      await cancelResponseBody(response);
      throw new Error(
        `Google Careers response exceeded ${GOOGLE_MAX_HTML_BYTES} bytes for ${context}`
      );
    }
  }
  if (!response.body) {
    throw new Error(`Google Careers returned an empty response for ${context}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let html = "";
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      reject(new GoogleBodyTimeoutError(
        `Google Careers body timed out after ${timeoutMs}ms for ${context}`
      ));
    }, timeoutMs);
  });

  try {
    while (true) {
      const chunk = await Promise.race([reader.read(), deadline]);
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > GOOGLE_MAX_HTML_BYTES) {
        throw new Error(
          `Google Careers response exceeded ${GOOGLE_MAX_HTML_BYTES} bytes for ${context}`
        );
      }
      html += decoder.decode(chunk.value, { stream: true });
    }
    return html + decoder.decode();
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

export function googleRetryDelayMs(
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

interface GoogleHtmlResponse {
  status: number;
  html: string | null;
}

async function fetchGoogleHtml(
  url: URL,
  context: string,
  budget?: ListRequestBudget
): Promise<GoogleHtmlResponse> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= UPSTREAM_ATTEMPTS; attempt += 1) {
    if (budget) {
      if (budget.used >= LIST_SUBREQUEST_BUDGET) {
        throw new Error(
          `Google Careers exhausted its ${LIST_SUBREQUEST_BUDGET}-subrequest list budget`
        );
      }
      budget.used += 1;
    }

    let response: Response;
    try {
      response = await fetchWithTimeout(url, {
        headers: {
          accept: "text/html,application/xhtml+xml",
          "accept-language": "en-US,en;q=0.9",
        },
      }, REQUEST_TIMEOUT_MS);
    } catch (error) {
      lastError = error;
      if (attempt === UPSTREAM_ATTEMPTS) {
        throw new Error(
          `Google Careers ${context} request failed after ${UPSTREAM_ATTEMPTS} attempts`,
          { cause: error }
        );
      }
      await waitForRetry(googleRetryDelayMs(null, attempt));
      continue;
    }

    lastError = undefined;
    if (response.ok) {
      return {
        status: response.status,
        html: await readBoundedGoogleCareersHtml(response, context),
      };
    }

    const retryable = isTransientStatus(response.status);
    const delay = googleRetryDelayMs(response.headers.get("retry-after"), attempt);
    await cancelResponseBody(response);
    if (!retryable || attempt === UPSTREAM_ATTEMPTS) {
      return { status: response.status, html: null };
    }
    await waitForRetry(delay);
  }

  throw new Error(`Google Careers ${context} request failed`, { cause: lastError });
}

function extractJsonArray(script: string, start: number, context: string) {
  let index = start;
  while (/\s/.test(script[index] ?? "")) index += 1;
  if (script[index] !== "[") {
    throw new Error(`Google Careers returned unexpected init data for ${context}`);
  }

  const arrayStart = index;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (; index < script.length; index += 1) {
    const character = script[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') {
      inString = true;
      continue;
    }
    if (character === "[") depth += 1;
    else if (character === "]") {
      depth -= 1;
      if (depth === 0) return script.slice(arrayStart, index + 1);
    }
  }
  throw new Error(`Google Careers returned unterminated init data for ${context}`);
}

function extractInitData(html: string, key: "ds:0" | "ds:1", context: string): InitData {
  const escapedKey = escapeRegExp(key);
  const opening = new RegExp(
    `<script\\b[^>]*\\bclass\\s*=\\s*(?:"${escapedKey}"|'${escapedKey}')[^>]*>`,
    "i"
  ).exec(html);
  if (!opening) {
    throw new Error(`Google Careers is missing ${key} init data for ${context}`);
  }
  const scriptStart = opening.index + opening[0].length;
  const scriptEnd = html.indexOf("</script>", scriptStart);
  if (scriptEnd < 0) {
    throw new Error(`Google Careers returned unterminated ${key} script for ${context}`);
  }
  const script = html.slice(scriptStart, scriptEnd);
  const keyPattern = new RegExp(`\\bkey\\s*:\\s*(['"])${escapedKey}\\1`);
  const keyMatch = keyPattern.exec(script);
  if (!keyMatch) {
    throw new Error(`Google Careers returned mismatched ${key} init data for ${context}`);
  }
  const dataPattern = /\bdata\s*:/g;
  dataPattern.lastIndex = keyMatch.index + keyMatch[0].length;
  const dataMatch = dataPattern.exec(script);
  if (!dataMatch) {
    throw new Error(`Google Careers is missing data for ${context}`);
  }

  const json = extractJsonArray(script, dataPattern.lastIndex, context);
  try {
    const data: unknown = JSON.parse(json);
    return {
      data,
      errorHasStatus: /\berrorHasStatus\s*:\s*true\b/.test(script),
    };
  } catch {
    throw new Error(`Google Careers returned invalid init JSON for ${context}`);
  }
}

function parseSearchPage(html: string, page: number): GoogleSearchPage {
  const init = extractInitData(html, "ds:1", `search page ${page}`);
  if (init.errorHasStatus || !Array.isArray(init.data)) {
    throw new Error(`Google Careers returned unexpected search data for page ${page}`);
  }
  const jobs = init.data[0];
  const total = init.data[2];
  const pageSize = init.data[3];
  if (
    !Array.isArray(jobs)
    || !jobs.every(Array.isArray)
    || typeof total !== "number"
    || !Number.isSafeInteger(total)
    || total < 0
    || typeof pageSize !== "number"
    || !Number.isSafeInteger(pageSize)
    || pageSize < 1
    || pageSize > MAX_PAGE_SIZE
  ) {
    throw new Error(`Google Careers returned unexpected search data for page ${page}`);
  }
  return { total, pageSize, jobs };
}

async function fetchSearchPage(page: number, budget: ListRequestBudget) {
  const response = await fetchGoogleHtml(
    googleSearchUrl(page),
    `search page ${page}`,
    budget
  );
  if (response.html === null) {
    throw new Error(
      `Google Careers search page ${page} returned HTTP ${response.status}`
    );
  }
  return parseSearchPage(response.html, page);
}

function googleExternalId(posting: unknown[]) {
  const externalId = requiredString(posting[0], "public ID", "with unknown ID");
  if (!/^\d+$/.test(externalId)) {
    throw new Error(`Google job returned unsafe public ID ${externalId}`);
  }
  return externalId;
}

function protobufTimestamp(value: unknown, field: string, externalId: string) {
  const nanoseconds = Array.isArray(value) && value[1] === undefined
    ? 0
    : Array.isArray(value)
      ? value[1]
      : undefined;
  if (
    !Array.isArray(value)
    || typeof value[0] !== "number"
    || !Number.isSafeInteger(value[0])
    || value[0] < 0
    || typeof nanoseconds !== "number"
    || !Number.isSafeInteger(nanoseconds)
    || nanoseconds < 0
    || nanoseconds > 999_999_999
  ) {
    throw new Error(`Google job ${externalId} has an invalid ${field}`);
  }
  const time = value[0] * 1_000 + Math.floor(nanoseconds / 1_000_000);
  const date = new Date(time);
  if (!Number.isFinite(date.getTime())) {
    throw new Error(`Google job ${externalId} has an invalid ${field}`);
  }
  return date.toISOString();
}

function googleLocation(posting: unknown[], externalId: string) {
  const rawLocations = posting[9];
  if (!Array.isArray(rawLocations) || rawLocations.length === 0) {
    throw new Error(`Google job ${externalId} is missing structured locations`);
  }

  const locations: string[] = [];
  for (const rawLocation of rawLocations) {
    if (!Array.isArray(rawLocation)) {
      throw new Error(`Google job ${externalId} is missing structured locations`);
    }
    const country = optionalString(rawLocation[5])?.toUpperCase();
    if (country !== "US") continue;
    locations.push(requiredString(rawLocation[0], "location name", externalId));
  }
  if (locations.length === 0) {
    throw new Error(`Google job ${externalId} escaped the configured US filter`);
  }

  const seen = new Set<string>();
  return locations.filter((location) => {
    const key = location.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).join(" / ");
}

function htmlField(posting: unknown[], index: number) {
  const field = posting[index];
  return Array.isArray(field) ? optionalString(field[1]) : null;
}

function section(title: string, html: string | null) {
  return html ? `<h2>${title}</h2>${html}` : null;
}

function googleDescription(posting: unknown[]) {
  return [
    section("About the job", htmlField(posting, 10)),
    section("Responsibilities", htmlField(posting, 3)),
    section("Qualifications", htmlField(posting, 4)),
  ].filter((value): value is string => Boolean(value)).join("\n") || null;
}

function mapGooglePosting(posting: unknown[], retainDescription = false): JobListing {
  const externalId = googleExternalId(posting);
  const title = requiredString(posting[1], "title", externalId);
  const location = googleLocation(posting, externalId);
  const department = optionalString(posting[7]);
  // The first timestamp is the original posting time. Google's date-sorted
  // feed orders updates near the front using later timestamps at indexes 13/14;
  // persisting index 12 avoids presenting an edit as a newly posted role.
  const postedAt = protobufTimestamp(posting[12], "posted timestamp", externalId);
  const shouldRetainDescription = retainDescription || isPotentialCatalogJobListing({
    title,
    department,
    location,
    postedAt,
  });
  const description = shouldRetainDescription ? googleDescription(posting) : null;

  return {
    externalId,
    title,
    url: googleDetailUrl(externalId).toString(),
    location,
    department,
    postedAt,
    description,
    salary: extractSalaryFromHtml(description),
  };
}

function expectedPageLength(page: GoogleSearchPage, pageNumber: number) {
  return Math.min(
    page.pageSize,
    Math.max(0, page.total - (pageNumber - 1) * page.pageSize)
  );
}

function validatePageLength(page: GoogleSearchPage, pageNumber: number) {
  const expected = expectedPageLength(page, pageNumber);
  if (page.jobs.length !== expected) {
    throw new GoogleSnapshotConsistencyError(
      `Google Careers page ${pageNumber} returned ${page.jobs.length} of ${expected} expected jobs`
    );
  }
}

function addPage(
  unique: Map<string, JobListing>,
  page: GoogleSearchPage,
  pageNumber: number,
  allowRepeatedIds: boolean
) {
  validatePageLength(page, pageNumber);
  const pageIds = new Set<string>();
  for (const posting of page.jobs) {
    const listing = mapGooglePosting(posting);
    if (pageIds.has(listing.externalId)) {
      throw new GoogleSnapshotConsistencyError(
        `Google Careers returned duplicate public ID ${listing.externalId}`
      );
    }
    pageIds.add(listing.externalId);
    if (unique.has(listing.externalId)) {
      if (allowRepeatedIds) continue;
      throw new GoogleSnapshotConsistencyError(
        `Google Careers returned duplicate public ID ${listing.externalId}`
      );
    }
    unique.set(listing.externalId, listing);
  }
}

function assertWithinSafetyLimit(total: number) {
  if (total > GOOGLE_RESULT_SAFETY_LIMIT) {
    throw new Error(
      `Google Careers exceeded the ${GOOGLE_RESULT_SAFETY_LIMIT}-job safety limit`
    );
  }
}

async function fetchGoogleDiscoverySnapshot() {
  const budget: ListRequestBudget = { used: 0 };
  const firstPage = await fetchSearchPage(1, budget);
  assertWithinSafetyLimit(firstPage.total);
  validatePageLength(firstPage, 1);
  if (firstPage.total === 0) return [];

  const pageCount = Math.min(
    GOOGLE_DISCOVERY_PAGE_LIMIT,
    Math.ceil(firstPage.total / firstPage.pageSize)
  );
  const unique = new Map<string, JobListing>();
  addPage(unique, firstPage, 1, true);

  const pages = Array.from({ length: pageCount - 1 }, (_, index) => index + 2);
  for (let index = 0; index < pages.length; index += PAGE_CONCURRENCY) {
    const pageNumbers = pages.slice(index, index + PAGE_CONCURRENCY);
    const batch = await Promise.all(
      pageNumbers.map((page) => fetchSearchPage(page, budget))
    );
    for (let batchIndex = 0; batchIndex < batch.length; batchIndex += 1) {
      addPage(unique, batch[batchIndex], pageNumbers[batchIndex], true);
    }
  }
  return [...unique.values()];
}

function pageIdentity(page: GoogleSearchPage) {
  return page.jobs.map(googleExternalId).join("\n");
}

interface GoogleSnapshotPass {
  jobs: JobListing[];
  total: number;
  stable: boolean;
}

async function fetchGoogleSnapshotPass(budget: ListRequestBudget): Promise<GoogleSnapshotPass> {
  const firstPage = await fetchSearchPage(1, budget);
  assertWithinSafetyLimit(firstPage.total);
  validatePageLength(firstPage, 1);
  if (firstPage.total === 0) return { jobs: [], total: 0, stable: true };

  const pageCount = Math.ceil(firstPage.total / firstPage.pageSize);
  const unique = new Map<string, JobListing>();
  // Google's date-sorted result set is live rather than cursor-backed. An edit
  // can move a posting across a page boundary while a full crawl is running,
  // legitimately repeating an ID on adjacent pages. Keep the first copy and
  // reconcile any omitted boundary row with another complete pass below.
  addPage(unique, firstPage, 1, true);

  const pages = Array.from({ length: pageCount - 1 }, (_, index) => index + 2);
  for (let index = 0; index < pages.length; index += PAGE_CONCURRENCY) {
    const pageNumbers = pages.slice(index, index + PAGE_CONCURRENCY);
    const batch = await Promise.all(
      pageNumbers.map((page) => fetchSearchPage(page, budget))
    );
    for (let batchIndex = 0; batchIndex < batch.length; batchIndex += 1) {
      const page = batch[batchIndex];
      const pageNumber = pageNumbers[batchIndex];
      if (
        page.total !== firstPage.total
        || page.pageSize !== firstPage.pageSize
      ) {
        throw new GoogleSnapshotConsistencyError(
          `Google Careers result count changed during pagination (${firstPage.total} to ${page.total})`
        );
      }
      addPage(unique, page, pageNumber, true);
    }
  }

  // A matching count cannot detect one removal and one insertion. Re-read the
  // newest edge before treating this as an authoritative closure snapshot.
  let leadingPageStable = true;
  let observedTotal = firstPage.total;
  if (pageCount > 1) {
    const verification = await fetchSearchPage(1, budget);
    validatePageLength(verification, 1);
    observedTotal = Math.max(observedTotal, verification.total);
    assertWithinSafetyLimit(observedTotal);
    leadingPageStable = !(
      verification.total !== firstPage.total
      || verification.pageSize !== firstPage.pageSize
      || pageIdentity(verification) !== pageIdentity(firstPage)
    );
    addPage(unique, verification, 1, true);
  }
  return {
    jobs: [...unique.values()],
    total: observedTotal,
    stable: leadingPageStable && unique.size === firstPage.total,
  };
}

async function fetchGoogleSnapshot() {
  const budget: ListRequestBudget = { used: 0 };
  let lastError: GoogleSnapshotConsistencyError | null = null;
  const conservativeUnion = new Map<string, JobListing>();
  let expectedTotal = 0;
  for (let attempt = 1; attempt <= SNAPSHOT_ATTEMPTS; attempt += 1) {
    try {
      const pass = await fetchGoogleSnapshotPass(budget);
      expectedTotal = Math.max(expectedTotal, pass.total);
      for (const job of pass.jobs) conservativeUnion.set(job.externalId, job);
      assertWithinSafetyLimit(conservativeUnion.size);
      if (pass.stable) return pass.jobs;
      // A pair of live page shifts can omit different boundary rows. Their
      // union is conservative for closure detection (recently removed rows may
      // linger for one poll) and avoids permanently rejecting an active board.
      if (attempt > 1 && conservativeUnion.size >= expectedTotal) {
        return [...conservativeUnion.values()];
      }
      lastError = new GoogleSnapshotConsistencyError(
        `Google Careers returned ${conservativeUnion.size} of ${expectedTotal} unique jobs across ${attempt} pass${attempt === 1 ? "" : "es"}`
      );
    } catch (error) {
      if (!(error instanceof GoogleSnapshotConsistencyError)) throw error;
      lastError = error;
    }
  }
  throw new Error(
    `Google Careers snapshot did not stabilize after ${SNAPSHOT_ATTEMPTS} attempts: ${
      lastError?.message ?? "unknown consistency error"
    }`
  );
}

function parseDetailPosting(html: string, externalId: string): unknown[] | null {
  const init = extractInitData(html, "ds:0", `job ${externalId}`);
  if (init.errorHasStatus) return null;
  if (
    !Array.isArray(init.data)
    || init.data.length !== 1
    || !Array.isArray(init.data[0])
  ) {
    throw new Error(`Google Careers returned unexpected detail data for ${externalId}`);
  }
  const posting = init.data[0];
  if (googleExternalId(posting) !== externalId) {
    throw new Error(`Google Careers detail did not match public ID ${externalId}`);
  }
  return posting;
}

export class GoogleCareersAdapter implements ATSAdapter {
  readonly name = "google";

  async fetchDiscoveryJobs(value: string): Promise<JobListing[]> {
    normalizeGoogleCareersSource(value);
    return fetchGoogleDiscoverySnapshot();
  }

  async fetchJobs(value: string): Promise<JobListing[]> {
    normalizeGoogleCareersSource(value);
    return fetchGoogleSnapshot();
  }

  async fetchJobContent(
    value: string,
    externalId: string
  ): Promise<JobContent> {
    normalizeGoogleCareersSource(value);
    const response = await fetchGoogleHtml(
      googleDetailUrl(externalId),
      `job ${externalId}`
    );
    if (response.status === 404 || response.status === 410) {
      return { description: null, salary: null };
    }
    if (response.html === null) {
      throw new Error(`Google Careers job ${externalId} returned HTTP ${response.status}`);
    }
    const posting = parseDetailPosting(response.html, externalId);
    if (!posting) return { description: null, salary: null };

    const listing = mapGooglePosting(posting, true);
    return {
      description: listing.description,
      salary: listing.salary,
      location: listing.location,
      postedAt: listing.postedAt,
    };
  }
}
