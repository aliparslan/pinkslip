import type {
  ATSAdapter,
  JobContent,
  JobListing,
  JobReference,
} from "./types";
import { extractSalaryFromHtml } from "./salary";
import { fetchWithTimeout } from "../http";
import { isPotentialCatalogJobListing } from "../job-scope";

const UBER_SOURCE = "uber";
const UBER_PUBLIC_ORIGIN = "https://jobs.uber.com";
const UBER_API_ORIGIN = "https://iaziqy.fa.ocs.oraclecloud.com";
const UBER_SEARCH_PATH =
  "/hcmRestApi/resources/latest/recruitingCEJobRequisitions";
const UBER_DETAIL_PATH =
  "/hcmRestApi/resources/latest/recruitingCEJobRequisitionDetails";
const UBER_SITE_NUMBER = "UberCareers";
const UBER_US_LOCATION = "United States";
const UBER_SORT = "POSTING_DATES_DESC";
const UBER_JOB_PATH = /^\/en\/jobs\/(\d+)\/?$/;
const UBER_PAGE_SIZE = 100;
const UBER_RESULT_SAFETY_LIMIT = 2_000;
const UBER_LIST_RESPONSE_LIMIT_BYTES = 512 * 1024;
const UBER_DETAIL_RESPONSE_LIMIT_BYTES = 512 * 1024;
const REQUEST_TIMEOUT_MS = 15_000;
const BODY_TIMEOUT_MS = 10_000;
const TRANSPORT_ATTEMPTS = 2;
const SNAPSHOT_ATTEMPTS = 3;
const BASE_RETRY_DELAY_MS = 250;
const MAX_RETRY_DELAY_MS = 2_000;
const FULL_SNAPSHOT_CONCURRENCY = 4;
const FULL_SNAPSHOT_SUBREQUEST_BUDGET = 900;

type JsonRecord = Record<string, unknown>;

export interface UberSearchSummary {
  externalId: string;
  title: string;
  location: string;
  locationCountry: string;
  department: string | null;
  postedAt: string | null;
}

export interface UberSearchPage {
  total: number;
  offset: number;
  jobs: UberSearchSummary[];
}

interface RequestBudget {
  used: number;
}

interface UberJsonResponse {
  status: number;
  payload: unknown | null;
}

class UberSnapshotConsistencyError extends Error {}
class UberResponseLimitError extends Error {}
class UberBodyReadTimeoutError extends Error {}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function requiredString(value: unknown, field: string, context: string) {
  const parsed = optionalString(value);
  if (!parsed) throw new Error(`Uber Careers ${context} is missing ${field}`);
  return parsed;
}

function requiredInteger(value: unknown, field: string, context: string) {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new Error(`Uber Careers ${context} has an invalid ${field}`);
  }
  return value as number;
}

function isSafePublicId(value: string) {
  return /^\d{1,18}$/.test(value);
}

function publicJobReference(externalId: string): JobReference {
  if (!isSafePublicId(externalId)) {
    throw new Error(`Uber Careers returned unsafe public ID ${externalId}`);
  }
  return {
    externalId,
    url: `${UBER_PUBLIC_ORIGIN}/en/jobs/${externalId}/`,
  };
}

function canonicalJobReference(value: string, expectedId?: string): JobReference {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Uber Careers returned an invalid public job URL");
  }

  const match = UBER_JOB_PATH.exec(url.pathname);
  if (
    url.protocol !== "https:"
    || url.origin !== UBER_PUBLIC_ORIGIN
    || url.username
    || url.password
    || url.port
    || url.search
    || url.hash
    || !match
  ) {
    throw new Error("Uber Careers job URL is outside its official public path");
  }

  const reference = publicJobReference(match[1]);
  if (expectedId !== undefined && reference.externalId !== expectedId) {
    throw new Error(
      `Uber Careers job URL did not match public ID ${expectedId}`
    );
  }
  return reference;
}

export function normalizeUberSource(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error("Uber Careers source is required");
  if (trimmed.toLowerCase() === UBER_SOURCE) return UBER_SOURCE;

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error(
      'Uber Careers source must be "uber" or an official jobs.uber.com URL'
    );
  }

  if (
    url.protocol !== "https:"
    || url.origin !== UBER_PUBLIC_ORIGIN
    || url.username
    || url.password
    || url.port
  ) {
    throw new Error("Uber Careers source URL must use HTTPS jobs.uber.com");
  }
  if (!/^\/en\/jobs\/?$/.test(url.pathname) && !UBER_JOB_PATH.test(url.pathname)) {
    throw new Error("Uber Careers source URL must use its /en/jobs path");
  }
  return UBER_SOURCE;
}

async function cancelResponseBody(response: Response) {
  if (!response.body) return;
  await response.body.cancel().catch(() => undefined);
}

export async function readBoundedUberJsonText(
  response: Response,
  context: string,
  timeoutMs = BODY_TIMEOUT_MS,
  maxResponseBytes = UBER_DETAIL_RESPONSE_LIMIT_BYTES
) {
  const contentType = response.headers.get("content-type");
  if (
    contentType
    && !/^application\/(?:[a-z0-9.+-]+\+)?json\b/i.test(contentType)
  ) {
    await cancelResponseBody(response);
    throw new Error(`Uber Careers returned ${contentType} for ${context}`);
  }

  const declaredLength = response.headers.get("content-length");
  if (declaredLength !== null) {
    const bytes = Number(declaredLength);
    if (!Number.isSafeInteger(bytes) || bytes < 0 || bytes > maxResponseBytes) {
      await cancelResponseBody(response);
      throw new UberResponseLimitError(
        `Uber Careers ${context} response exceeded ${maxResponseBytes} bytes`
      );
    }
  }
  if (!response.body) {
    throw new Error(`Uber Careers returned an empty response for ${context}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let received = 0;
  let text = "";
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => reject(new UberBodyReadTimeoutError(
      `Uber Careers ${context} body timed out after ${timeoutMs}ms`
    )), timeoutMs);
  });

  try {
    while (true) {
      const chunk = await Promise.race([reader.read(), deadline]);
      if (chunk.done) break;
      received += chunk.value.byteLength;
      if (received > maxResponseBytes) {
        throw new UberResponseLimitError(
          `Uber Careers ${context} response exceeded ${maxResponseBytes} bytes`
        );
      }
      text += decoder.decode(chunk.value, { stream: true });
    }
    return text + decoder.decode();
  } catch (error) {
    await reader.cancel(error).catch(() => undefined);
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

export function uberRetryDelayMs(
  retryAfter: string | null,
  attempt: number,
  nowMs = Date.now()
) {
  if (retryAfter !== null) {
    const trimmed = retryAfter.trim();
    if (/^\d+(?:\.\d+)?$/.test(trimmed)) {
      return Math.min(
        MAX_RETRY_DELAY_MS,
        Math.max(0, Number(trimmed) * 1_000)
      );
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

async function fetchUberJson(
  url: URL,
  context: string,
  maxResponseBytes: number,
  budget?: RequestBudget
): Promise<UberJsonResponse> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= TRANSPORT_ATTEMPTS; attempt += 1) {
    if (budget) {
      if (budget.used >= FULL_SNAPSHOT_SUBREQUEST_BUDGET) {
        throw new Error(
          `Uber Careers exhausted its ${FULL_SNAPSHOT_SUBREQUEST_BUDGET}-subrequest snapshot budget`
        );
      }
      budget.used += 1;
    }

    let response: Response;
    try {
      response = await fetchWithTimeout(url, {
        headers: {
          accept: "application/json",
          "accept-language": "en-US,en;q=0.9",
        },
      }, REQUEST_TIMEOUT_MS);
    } catch (error) {
      lastError = error;
      if (attempt === TRANSPORT_ATTEMPTS) {
        throw new Error(
          `Uber Careers ${context} request failed after ${TRANSPORT_ATTEMPTS} attempts`,
          { cause: error }
        );
      }
      await waitForRetry(uberRetryDelayMs(null, attempt));
      continue;
    }

    if (!response.ok) {
      const delay = uberRetryDelayMs(
        response.headers.get("retry-after"),
        attempt
      );
      const retryable = isTransientStatus(response.status);
      await cancelResponseBody(response);
      if (!retryable || attempt === TRANSPORT_ATTEMPTS) {
        return { status: response.status, payload: null };
      }
      await waitForRetry(delay);
      continue;
    }

    const text = await readBoundedUberJsonText(
      response,
      context,
      BODY_TIMEOUT_MS,
      maxResponseBytes
    );
    let payload: unknown;
    try {
      payload = JSON.parse(text);
    } catch (error) {
      throw new Error(`Uber Careers ${context} returned invalid JSON`, {
        cause: error,
      });
    }
    return { status: response.status, payload };
  }
  throw new Error(`Uber Careers ${context} request failed`, { cause: lastError });
}

function normalizeSummaryPostedAt(value: unknown, externalId: string) {
  if (value === null || value === undefined || value === "") return null;
  const date = requiredString(value, "posted date", `job ${externalId}`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error(`Uber Careers job ${externalId} has an invalid posted date`);
  }
  const timestamp = Date.parse(`${date}T00:00:00.000Z`);
  if (!Number.isFinite(timestamp)) {
    throw new Error(`Uber Careers job ${externalId} has an invalid posted date`);
  }
  return new Date(timestamp).toISOString();
}

function normalizedDetailPostedAt(value: unknown, externalId: string) {
  const date = requiredString(value, "original posted date", `job ${externalId}`);
  const timestamp = Date.parse(date);
  if (!Number.isFinite(timestamp)) {
    throw new Error(
      `Uber Careers job ${externalId} has an invalid original posted date`
    );
  }
  return new Date(timestamp).toISOString();
}

function summaryFromRecord(value: unknown, offset: number): UberSearchSummary {
  if (!isRecord(value)) {
    throw new UberSnapshotConsistencyError(
      `Uber Careers offset ${offset} contained a malformed requisition`
    );
  }
  const externalId = requiredString(value.Id, "public ID", `offset ${offset}`);
  if (!isSafePublicId(externalId)) {
    throw new Error(`Uber Careers returned unsafe public ID ${externalId}`);
  }
  const title = requiredString(value.Title, "title", `job ${externalId}`);
  const location = requiredString(
    value.PrimaryLocation,
    "primary location",
    `job ${externalId}`
  );
  const locationCountry = requiredString(
    value.PrimaryLocationCountry,
    "primary location country",
    `job ${externalId}`
  );
  if (
    locationCountry.toUpperCase() !== "US"
    || !/\bUnited States(?: of America)?\b/i.test(location)
  ) {
    throw new UberSnapshotConsistencyError(
      `Uber Careers US search returned non-US job ${externalId}`
    );
  }
  return {
    externalId,
    title,
    location,
    locationCountry,
    department: optionalString(value.Department)
      ?? optionalString(value.JobFunction)
      ?? optionalString(value.JobFamily),
    postedAt: normalizeSummaryPostedAt(value.PostedDate, externalId),
  };
}

export function parseUberSearchPage(
  payload: unknown,
  expectedOffset: number
): UberSearchPage {
  if (!isRecord(payload) || !Array.isArray(payload.items)) {
    throw new Error("Uber Careers returned an unexpected search payload");
  }
  if (payload.items.length !== 1 || !isRecord(payload.items[0])) {
    throw new Error("Uber Careers search payload did not contain one search result");
  }
  const search = payload.items[0];
  const context = `offset ${expectedOffset}`;
  const searchId = requiredInteger(search.SearchId, "search ID", context);
  const site = requiredString(search.SiteNumber, "site number", context);
  const location = requiredString(search.Location, "location filter", context);
  const sort = requiredString(search.SortBy, "sort order", context);
  const offset = requiredInteger(search.Offset, "offset", context);
  const limit = requiredInteger(search.Limit, "limit", context);
  const total = requiredInteger(search.TotalJobsCount, "total count", context);
  if (
    searchId !== 1
    || site !== UBER_SITE_NUMBER
    || location !== UBER_US_LOCATION
    || sort !== UBER_SORT
    || offset !== expectedOffset
    || limit !== UBER_PAGE_SIZE
  ) {
    throw new Error(`Uber Careers returned unexpected search metadata at ${context}`);
  }
  if (total > UBER_RESULT_SAFETY_LIMIT) {
    throw new Error(
      `Uber Careers exceeded the ${UBER_RESULT_SAFETY_LIMIT}-job safety limit`
    );
  }
  if (!Array.isArray(search.requisitionList)) {
    throw new Error(`Uber Careers ${context} is missing its requisition list`);
  }

  const jobs = search.requisitionList.map((row) =>
    summaryFromRecord(row, expectedOffset)
  );
  const expectedCount = Math.min(
    UBER_PAGE_SIZE,
    Math.max(0, total - expectedOffset)
  );
  if (jobs.length !== expectedCount) {
    throw new UberSnapshotConsistencyError(
      `Uber Careers offset ${expectedOffset} returned ${jobs.length} of ${expectedCount} expected jobs`
    );
  }
  const seen = new Set<string>();
  for (const job of jobs) {
    if (seen.has(job.externalId)) {
      throw new UberSnapshotConsistencyError(
        `Uber Careers repeated public ID ${job.externalId} within offset ${expectedOffset}`
      );
    }
    seen.add(job.externalId);
  }
  return { total, offset, jobs };
}

function searchUrl(offset: number) {
  const url = new URL(UBER_SEARCH_PATH, UBER_API_ORIGIN);
  url.searchParams.set(
    "finder",
    `findReqs;siteNumber=${UBER_SITE_NUMBER},limit=${UBER_PAGE_SIZE},offset=${offset},location=${UBER_US_LOCATION},sortBy=${UBER_SORT}`
  );
  url.searchParams.set("expand", "requisitionList");
  url.searchParams.set("onlyData", "true");
  return url;
}

async function fetchUberSearchPage(offset: number, budget?: RequestBudget) {
  const response = await fetchUberJson(
    searchUrl(offset),
    `US search offset ${offset}`,
    UBER_LIST_RESPONSE_LIMIT_BYTES,
    budget
  );
  if (response.payload === null) {
    throw new Error(
      `Uber Careers US search offset ${offset} returned HTTP ${response.status}`
    );
  }
  return parseUberSearchPage(response.payload, offset);
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

  await Promise.all(Array.from(
    { length: Math.max(1, Math.min(limit, items.length)) },
    () => runNext()
  ));
  if (failure !== undefined) throw failure;
  return results;
}

async function fetchUberSummarySnapshot(budget?: RequestBudget) {
  const first = await fetchUberSearchPage(0, budget);
  const offsets: number[] = [];
  for (let offset = UBER_PAGE_SIZE; offset < first.total; offset += UBER_PAGE_SIZE) {
    offsets.push(offset);
  }
  const remaining = await mapWithConcurrency(
    offsets,
    FULL_SNAPSHOT_CONCURRENCY,
    (offset) => fetchUberSearchPage(offset, budget)
  );

  const jobs = [...first.jobs];
  for (const page of remaining) {
    if (page.total !== first.total) {
      throw new UberSnapshotConsistencyError(
        `Uber Careers result count changed during pagination (${first.total} to ${page.total})`
      );
    }
    jobs.push(...page.jobs);
  }
  if (jobs.length !== first.total) {
    throw new UberSnapshotConsistencyError(
      `Uber Careers returned ${jobs.length} of ${first.total} advertised jobs`
    );
  }

  const seen = new Set<string>();
  for (const job of jobs) {
    if (seen.has(job.externalId)) {
      throw new UberSnapshotConsistencyError(
        `Uber Careers repeated public ID ${job.externalId} across search pages`
      );
    }
    seen.add(job.externalId);
  }
  return jobs;
}

function snapshotIdentity(jobs: UberSearchSummary[]) {
  return [...jobs]
    .map((job) => job.externalId)
    .sort((left, right) => left.localeCompare(right))
    .join("\n");
}

async function fetchStableUberSummaries(budget?: RequestBudget) {
  let previous: UberSearchSummary[] | null = null;
  let lastConsistencyError: unknown;
  for (let attempt = 1; attempt <= SNAPSHOT_ATTEMPTS; attempt += 1) {
    try {
      const current = await fetchUberSummarySnapshot(budget);
      if (
        previous !== null
        && snapshotIdentity(previous) === snapshotIdentity(current)
      ) {
        return current;
      }
      if (previous !== null) {
        lastConsistencyError = new UberSnapshotConsistencyError(
          `Uber Careers US job identities changed between complete scans (${previous.length} to ${current.length})`
        );
      }
      previous = current;
    } catch (error) {
      if (!(error instanceof UberSnapshotConsistencyError)) throw error;
      lastConsistencyError = error;
      previous = null;
    }
  }

  const detail = lastConsistencyError instanceof Error
    ? `: ${lastConsistencyError.message}`
    : "";
  throw new Error(
    `Uber Careers snapshot did not stabilize after ${SNAPSHOT_ATTEMPTS} attempts${detail}`,
    { cause: lastConsistencyError }
  );
}

function summaryListing(summary: UberSearchSummary): JobListing {
  const reference = publicJobReference(summary.externalId);
  return {
    externalId: summary.externalId,
    title: summary.title,
    url: reference.url,
    location: summary.location,
    department: summary.department,
    postedAt: summary.postedAt,
    description: null,
    salary: null,
  };
}

function isUnitedStates(value: unknown) {
  const normalized = optionalString(value)?.toLowerCase() ?? "";
  return normalized === "us"
    || normalized === "usa"
    || normalized === "united states"
    || normalized === "united states of america";
}

function uniqueLocations(values: string[]) {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = value.trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function detailLocation(detail: JsonRecord, externalId: string) {
  const allLocations: string[] = [];
  const usLocations: string[] = [];
  const primary = requiredString(
    detail.PrimaryLocation,
    "primary location",
    `job ${externalId}`
  );
  allLocations.push(primary);
  if (
    isUnitedStates(detail.PrimaryLocationCountry)
    || /\bUnited States(?: of America)?\b/i.test(primary)
  ) {
    usLocations.push(primary);
  }

  if (Array.isArray(detail.secondaryLocations)) {
    for (const rawLocation of detail.secondaryLocations) {
      if (!isRecord(rawLocation)) continue;
      const name = optionalString(rawLocation.Name);
      if (!name) continue;
      allLocations.push(name);
      if (
        isUnitedStates(rawLocation.CountryCode)
        || /\bUnited States(?: of America)?\b/i.test(name)
      ) {
        usLocations.push(name);
      }
    }
  }

  const workplaceType = [
    optionalString(detail.WorkplaceType),
    optionalString(detail.WorkplaceTypeCode),
  ].filter((value): value is string => Boolean(value)).join(" ");
  if (/\bremote\b|ORA_REMOTE/i.test(workplaceType) && usLocations.length > 0) {
    usLocations.unshift("Remote, US");
  }

  const selected = uniqueLocations(
    usLocations.length > 0 ? usLocations : allLocations
  );
  if (selected.length === 0) {
    throw new Error(`Uber Careers job ${externalId} is missing locations`);
  }
  return selected.join(" / ");
}

function descriptionSection(title: string, value: unknown) {
  const content = optionalString(value);
  return content ? `<h2>${title}</h2>${content}` : null;
}

function detailDescription(detail: JsonRecord, externalId: string) {
  const about = optionalString(detail.ExternalDescriptionStr)
    ?? optionalString(detail.ShortDescriptionStr);
  const description = [
    about,
    descriptionSection("Responsibilities", detail.ExternalResponsibilitiesStr),
    descriptionSection("Qualifications", detail.ExternalQualificationsStr),
  ].filter((value): value is string => Boolean(value)).join("\n");
  if (!description) {
    throw new Error(`Uber Careers job ${externalId} is missing its description`);
  }
  return description;
}

export function mapUberJobDetail(
  payload: unknown,
  reference: JobReference,
  retainDescription = false
): JobListing {
  if (!isRecord(payload)) {
    throw new Error(`Uber Careers job ${reference.externalId} returned malformed detail data`);
  }
  const externalId = requiredString(payload.Id, "public ID", "job detail");
  if (externalId !== reference.externalId) {
    throw new Error(
      `Uber Careers detail identity did not match public ID ${reference.externalId}`
    );
  }
  canonicalJobReference(reference.url, externalId);

  const title = requiredString(payload.Title, "title", `job ${externalId}`);
  const location = detailLocation(payload, externalId);
  const postedAt = normalizedDetailPostedAt(
    payload.ExternalPostedStartDate,
    externalId
  );
  const fullDescription = detailDescription(payload, externalId);
  const preliminary = {
    externalId,
    title,
    url: reference.url,
    location,
    department: optionalString(payload.Department)
      ?? optionalString(payload.JobFunction)
      ?? optionalString(payload.Category),
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

function detailUrl(externalId: string) {
  const reference = publicJobReference(externalId);
  const url = new URL(
    `${UBER_DETAIL_PATH}/${reference.externalId}`,
    UBER_API_ORIGIN
  );
  url.searchParams.set("expand", "all");
  url.searchParams.set("onlyData", "true");
  return url;
}

async function fetchUberJob(
  reference: JobReference,
  budget?: RequestBudget,
  retainDescription = false
): Promise<JobListing | null> {
  const response = await fetchUberJson(
    detailUrl(reference.externalId),
    `job ${reference.externalId}`,
    UBER_DETAIL_RESPONSE_LIMIT_BYTES,
    budget
  );
  if (response.status === 404 || response.status === 410) return null;
  if (response.payload === null) {
    throw new Error(
      `Uber Careers job ${reference.externalId} returned HTTP ${response.status}`
    );
  }
  return mapUberJobDetail(response.payload, reference, retainDescription);
}

async function fetchUberFullSnapshot() {
  const budget: RequestBudget = { used: 0 };
  const summaries = await fetchStableUberSummaries(budget);
  return mapWithConcurrency(
    summaries,
    FULL_SNAPSHOT_CONCURRENCY,
    async (summary) => {
      const listing = summaryListing(summary);
      if (!isPotentialCatalogJobListing(listing)) return listing;
      // A requisition can close in the small interval after two matching search
      // scans. Keeping its validated summary for this one full pass is
      // conservative: it prevents a false close, while the next reference poll
      // will observe the removal authoritatively.
      return await fetchUberJob(publicJobReference(summary.externalId), budget)
        ?? listing;
    }
  );
}

export class UberAdapter implements ATSAdapter {
  readonly name = "uber";

  async fetchDiscoveryJobReferences(value: string): Promise<JobReference[]> {
    normalizeUberSource(value);
    const summaries = await fetchStableUberSummaries();
    return summaries.map((summary) => publicJobReference(summary.externalId));
  }

  async fetchJobListing(
    value: string,
    externalId: string,
    jobUrl?: string
  ): Promise<JobListing> {
    normalizeUberSource(value);
    const reference = canonicalJobReference(
      jobUrl ?? publicJobReference(externalId).url,
      externalId
    );
    const listing = await fetchUberJob(reference);
    if (!listing) {
      throw new Error(`Uber Careers job ${externalId} is no longer available`);
    }
    return listing;
  }

  async fetchJobs(value: string): Promise<JobListing[]> {
    normalizeUberSource(value);
    return fetchUberFullSnapshot();
  }

  async fetchJobContent(
    value: string,
    externalId: string,
    jobUrl?: string
  ): Promise<JobContent> {
    normalizeUberSource(value);
    const reference = canonicalJobReference(
      jobUrl ?? publicJobReference(externalId).url,
      externalId
    );
    const listing = await fetchUberJob(reference, undefined, true);
    if (!listing) return { description: null, salary: null };
    return {
      description: listing.description,
      salary: listing.salary,
      location: listing.location,
      postedAt: listing.postedAt,
    };
  }
}
