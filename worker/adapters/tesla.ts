import type { ATSAdapter, JobContent, JobListing } from "./types";
import { extractSalaryFromHtml } from "./salary";
import { fetchWithTimeout } from "../http";

const TESLA_SOURCE = "tesla";
const TESLA_ORIGIN = "https://www.tesla.com";
const TESLA_STATE_URL = `${TESLA_ORIGIN}/cua-api/apps/careers/state`;
const TESLA_DETAIL_ROOT = `${TESLA_ORIGIN}/cua-api/careers/job`;
const TESLA_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
  + "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36";
const TESLA_CAREERS_HOSTS = new Set(["tesla.com", "www.tesla.com"]);
const TESLA_JOB_PATH = /^\/careers\/search\/job\/([^/?#]+)-(\d+)\/?$/;
const TESLA_RESULT_SAFETY_LIMIT = 25_000;
export const TESLA_STATE_LIMIT_BYTES = 16 * 1024 * 1024;
export const TESLA_DETAIL_LIMIT_BYTES = 3 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 20_000;
const BODY_TIMEOUT_MS = 20_000;
const UPSTREAM_ATTEMPTS = 3;
const BASE_RETRY_DELAY_MS = 250;
const MAX_RETRY_DELAY_MS = 5_000;
const TESLA_ELIGIBLE_TIME_TYPES = new Set([
  "fulltime",
  "intern",
  "internship",
  "internapprentice",
  "coop",
]);

type JsonRecord = Record<string, unknown>;

interface TeslaJsonResponse {
  status: number;
  payload: unknown | null;
}

class TeslaBodyTimeoutError extends Error {}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function requiredString(value: unknown, field: string, context: string) {
  const parsed = optionalString(value);
  if (!parsed) throw new Error(`Tesla ${context} is missing ${field}`);
  return parsed;
}

function scalarKey(value: unknown, field: string, context: string) {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) {
    return String(value);
  }
  throw new Error(`Tesla ${context} returned an invalid ${field}`);
}

function teslaExternalId(value: unknown, context: string) {
  const id = scalarKey(value, "id", context);
  if (!/^\d+$/.test(id)) {
    throw new Error(`Tesla ${context} returned an unsafe requisition ID ${id}`);
  }
  return id;
}

/** Matches the slug function shipped by Tesla's public careers application. */
export function teslaTitleSlug(title: string) {
  const slug = title
    .toLowerCase()
    .replace(/[\s_/\]\[]/g, "-")
    .replace(/[^A-Za-z0-9\-_]+/gi, "")
    .replace(/-+/gi, "-");
  if (!slug || slug.length > 350) {
    throw new Error("Tesla job returned a title that cannot form a public URL");
  }
  return slug;
}

function canonicalTeslaJobUrl(title: string, externalId: string) {
  return `${TESLA_ORIGIN}/careers/search/job/${teslaTitleSlug(title)}-${externalId}`;
}

function validateTeslaJobUrl(value: string, expectedId: string) {
  let url: URL;
  try {
    url = new URL(value, TESLA_ORIGIN);
  } catch {
    throw new Error(`Tesla job ${expectedId} returned an invalid public URL`);
  }
  const match = TESLA_JOB_PATH.exec(url.pathname);
  if (
    url.protocol !== "https:"
    || url.origin !== TESLA_ORIGIN
    || url.port
    || url.username
    || url.password
    || url.search
    || url.hash
    || !match
    || match[2] !== expectedId
  ) {
    throw new Error(`Tesla job URL did not match requisition ID ${expectedId}`);
  }
  return url.toString();
}

export function normalizeTeslaSource(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error("Tesla source is required");
  if (trimmed.toLowerCase() === TESLA_SOURCE) return TESLA_SOURCE;

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error('Tesla source must be "tesla" or an official Tesla careers URL');
  }
  if (
    url.protocol !== "https:"
    || !TESLA_CAREERS_HOSTS.has(url.hostname.toLowerCase())
    || url.port
    || url.username
    || url.password
    || !/^\/careers\/search(?:\/|$)/.test(url.pathname)
  ) {
    throw new Error("Tesla source URL must use the official HTTPS careers search path");
  }
  return TESLA_SOURCE;
}

function requestHeaders() {
  // Tesla's public JSON endpoint enforces browser-request consistency and can
  // also deny shared datacenter egress. A UA without matching Fetch Metadata
  // and client hints is rejected consistently; this coherent profile avoids
  // that malformed-request case. Any remaining 403 still fails closed below
  // rather than being retried or mistaken for an empty job board.
  return {
    accept: "application/json, text/plain, */*",
    "accept-language": "en-US,en;q=0.9",
    referer: `${TESLA_ORIGIN}/careers/search/`,
    "sec-ch-ua": '"Chromium";v="139", "Google Chrome";v="139", "Not;A=Brand";v="99"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"macOS"',
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "same-origin",
    "user-agent": TESLA_USER_AGENT,
  };
}

async function cancelResponseBody(response: Response) {
  if (!response.body) return;
  await response.body.cancel().catch(() => undefined);
}

export async function readBoundedTeslaJson(
  response: Response,
  context: string,
  limitBytes: number,
  timeoutMs = BODY_TIMEOUT_MS
): Promise<unknown> {
  const contentType = response.headers.get("content-type");
  if (contentType && !/^(?:application|text)\/(?:[a-z0-9.+-]*\+)?json\b/i.test(contentType)) {
    await cancelResponseBody(response);
    throw new Error(`Tesla Careers returned ${contentType} for ${context}`);
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
      throw new Error(`Tesla Careers ${context} exceeded ${limitBytes} bytes`);
    }
  }
  if (!response.body) {
    throw new Error(`Tesla Careers returned an empty response for ${context}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let received = 0;
  let text = "";
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => reject(new TeslaBodyTimeoutError(
      `Tesla Careers ${context} body timed out after ${timeoutMs}ms`
    )), timeoutMs);
  });

  try {
    while (true) {
      const chunk = await Promise.race([reader.read(), deadline]);
      if (chunk.done) break;
      received += chunk.value.byteLength;
      if (received > limitBytes) {
        throw new Error(`Tesla Careers ${context} exceeded ${limitBytes} bytes`);
      }
      text += decoder.decode(chunk.value, { stream: true });
    }
    text += decoder.decode();
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
    reader.releaseLock();
  }

  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    throw new Error(`Tesla Careers returned invalid JSON for ${context}`, {
      cause: error,
    });
  }
}

function isTransientStatus(status: number) {
  return status === 408
    || status === 425
    || status === 429
    || (status >= 500 && status <= 599);
}

export function teslaRetryDelayMs(
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

async function fetchTeslaJson(
  url: string,
  context: string,
  limitBytes: number
): Promise<TeslaJsonResponse> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= UPSTREAM_ATTEMPTS; attempt += 1) {
    let response: Response;
    try {
      response = await fetchWithTimeout(url, {
        headers: requestHeaders(),
      }, REQUEST_TIMEOUT_MS);
    } catch (error) {
      lastError = error;
      if (attempt === UPSTREAM_ATTEMPTS) throw error;
      await waitForRetry(teslaRetryDelayMs(null, attempt));
      continue;
    }

    if (!response.ok) {
      const retryable = isTransientStatus(response.status);
      const delayMs = teslaRetryDelayMs(
        response.headers.get("retry-after"),
        attempt
      );
      await cancelResponseBody(response);
      if (retryable && attempt < UPSTREAM_ATTEMPTS) {
        await waitForRetry(delayMs);
        continue;
      }
      return { status: response.status, payload: null };
    }

    try {
      return {
        status: response.status,
        payload: await readBoundedTeslaJson(response, context, limitBytes),
      };
    } catch (error) {
      lastError = error;
      const retryable = error instanceof TeslaBodyTimeoutError
        || error instanceof TypeError;
      if (!retryable || attempt === UPSTREAM_ATTEMPTS) throw error;
      await waitForRetry(teslaRetryDelayMs(null, attempt));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

function parseStringLookup(value: unknown, field: string) {
  if (!isRecord(value)) {
    throw new Error(`Tesla Careers state is missing lookup.${field}`);
  }
  const result = new Map<string, string>();
  for (const [key, raw] of Object.entries(value)) {
    const label = optionalString(raw);
    if (!label) {
      throw new Error(`Tesla Careers state has an invalid lookup.${field}.${key}`);
    }
    result.set(key, label);
  }
  if (result.size === 0) {
    throw new Error(`Tesla Careers state has an empty lookup.${field}`);
  }
  return result;
}

function collectCityLocationIds(
  cities: unknown,
  context: string,
  target: Set<string>
) {
  if (cities === undefined) return;
  if (!isRecord(cities)) {
    throw new Error(`Tesla Careers state has invalid cities for ${context}`);
  }
  for (const [city, rawIds] of Object.entries(cities)) {
    const ids = Array.isArray(rawIds) ? rawIds : [rawIds];
    if (ids.length === 0) {
      throw new Error(`Tesla Careers state has no locations for ${context}/${city}`);
    }
    for (const rawId of ids) {
      target.add(scalarKey(rawId, "location ID", `${context}/${city}`));
    }
  }
}

function usLocationIds(geo: unknown) {
  if (!Array.isArray(geo) || geo.length === 0 || !geo.every(isRecord)) {
    throw new Error("Tesla Careers state returned invalid geo data");
  }

  const countries: JsonRecord[] = [];
  for (const region of geo) {
    if (!Array.isArray(region.sites) || !region.sites.every(isRecord)) {
      throw new Error("Tesla Careers state returned a region without sites");
    }
    for (const country of region.sites) {
      if (scalarKey(country.id, "country ID", "geo country") === "US") {
        countries.push(country);
      }
    }
  }
  if (countries.length !== 1) {
    throw new Error(`Tesla Careers state returned ${countries.length} US geo entries`);
  }

  const locations = new Set<string>();
  const country = countries[0];
  if (country.cities !== undefined) {
    collectCityLocationIds(country.cities, "US", locations);
  } else if (Array.isArray(country.states) && country.states.every(isRecord)) {
    if (country.states.length === 0) {
      throw new Error("Tesla Careers state returned no US states");
    }
    for (const state of country.states) {
      const stateId = scalarKey(state.id, "state ID", "US state");
      collectCityLocationIds(state.cities, `US/${stateId}`, locations);
    }
  } else {
    throw new Error("Tesla Careers state returned an unsupported US geo entry");
  }
  if (locations.size === 0) {
    throw new Error("Tesla Careers state returned no US locations");
  }
  return locations;
}

function parsePostedAt(value: unknown, context: string) {
  if (value === null || value === undefined || value === "") return null;
  const raw = optionalString(value);
  if (!raw || !/^\d{4}-\d{2}-\d{2}(?:[T\s].*)?$/.test(raw)) {
    throw new Error(`Tesla ${context} returned an invalid posted date`);
  }
  const time = Date.parse(raw);
  if (!Number.isFinite(time)) {
    throw new Error(`Tesla ${context} returned an invalid posted date`);
  }
  return new Date(time).toISOString();
}

function normalizeTeslaTimeType(value: string) {
  return value.toLowerCase().replace(/[^a-z]/g, "");
}

function isEligibleTeslaTimeType(value: string) {
  return TESLA_ELIGIBLE_TIME_TYPES.has(normalizeTeslaTimeType(value));
}

function detailPostedAt(detail: JsonRecord, context: string) {
  const values = [detail.pb, detail.datePosted, detail.postedAt]
    .filter((value) => value !== null && value !== undefined && value !== "")
    .map((value) => parsePostedAt(value, context));
  const unique = [...new Set(values)];
  if (unique.length > 1) {
    throw new Error(`Tesla ${context} returned conflicting posted dates`);
  }
  return unique[0] ?? null;
}

export function parseTeslaState(payload: unknown): JobListing[] {
  if (!isRecord(payload)) {
    throw new Error("Tesla Careers returned an unexpected state payload");
  }
  if (!Array.isArray(payload.listings) || !payload.listings.every(isRecord)) {
    throw new Error("Tesla Careers state is missing listings");
  }
  if (payload.listings.length === 0) {
    throw new Error("Tesla Careers returned an empty global listing snapshot");
  }
  if (payload.listings.length > TESLA_RESULT_SAFETY_LIMIT) {
    throw new Error(
      `Tesla Careers exceeded the ${TESLA_RESULT_SAFETY_LIMIT}-job safety limit`
    );
  }
  if (!isRecord(payload.lookup)) {
    throw new Error("Tesla Careers state is missing lookup data");
  }

  const departments = parseStringLookup(payload.lookup.departments, "departments");
  const locations = parseStringLookup(payload.lookup.locations, "locations");
  const types = parseStringLookup(payload.lookup.types, "types");
  const eligibleTypeIds = new Set(
    [...types.entries()]
      .filter(([, label]) => isEligibleTeslaTimeType(label))
      .map(([id]) => id)
  );
  if (![...types.values()].some((label) => normalizeTeslaTimeType(label) === "fulltime")) {
    throw new Error(
      "Tesla Careers state returned no full-time job type"
    );
  }
  const usLocations = usLocationIds(payload.geo);
  const seen = new Set<string>();
  const jobs: JobListing[] = [];

  for (const posting of payload.listings) {
    const externalId = teslaExternalId(posting.id, "state listing");
    if (seen.has(externalId)) {
      throw new Error(`Tesla Careers repeated requisition ID ${externalId}`);
    }
    seen.add(externalId);

    const locationId = scalarKey(
      posting.l,
      "location ID",
      `job ${externalId}`
    );
    const typeId = scalarKey(posting.y, "type ID", `job ${externalId}`);
    if (!usLocations.has(locationId) || !eligibleTypeIds.has(typeId)) continue;

    const title = requiredString(posting.t, "title", `job ${externalId}`);
    const departmentId = scalarKey(
      posting.dp,
      "department ID",
      `job ${externalId}`
    );
    const department = departments.get(departmentId);
    const location = locations.get(locationId);
    if (!department) {
      throw new Error(`Tesla job ${externalId} referenced unknown department ${departmentId}`);
    }
    if (!location) {
      throw new Error(`Tesla job ${externalId} referenced unknown location ${locationId}`);
    }

    jobs.push({
      externalId,
      title,
      url: canonicalTeslaJobUrl(title, externalId),
      location,
      department,
      postedAt: parsePostedAt(posting.pb, `job ${externalId}`),
      description: null,
      salary: null,
    });
  }
  if (jobs.length === 0) {
    throw new Error("Tesla Careers returned an empty eligible US snapshot");
  }
  return jobs;
}

function detailDescription(detail: JsonRecord) {
  const overview = optionalString(detail.jobDescription)
    ?? optionalString(detail.description);
  const responsibilities = optionalString(detail.jobResponsibilities);
  const requirements = optionalString(detail.jobRequirements);
  const compensation = optionalString(detail.jobCompensationAndBenefits);
  return [
    overview,
    responsibilities
      ? `<h2>What you’ll do</h2>${responsibilities}`
      : null,
    requirements
      ? `<h2>What you’ll bring</h2>${requirements}`
      : null,
    compensation
      ? `<h2>Compensation and benefits</h2>${compensation}`
      : null,
  ].filter((section): section is string => Boolean(section)).join("\n") || null;
}

export function mapTeslaJobDetail(
  payload: unknown,
  expectedId: string
): JobListing {
  if (!isRecord(payload)) {
    throw new Error(`Tesla job ${expectedId} returned an unexpected detail payload`);
  }
  const externalId = teslaExternalId(payload.id, `job ${expectedId}`);
  if (externalId !== expectedId) {
    throw new Error(`Tesla job detail did not match requisition ID ${expectedId}`);
  }
  const title = requiredString(payload.title, "title", `job ${externalId}`);
  const location = requiredString(payload.location, "location", `job ${externalId}`);
  const department = requiredString(
    payload.department,
    "department",
    `job ${externalId}`
  );
  const timeType = requiredString(payload.timeType, "timeType", `job ${externalId}`);
  if (!isEligibleTeslaTimeType(timeType)) {
    throw new Error(`Tesla job ${externalId} escaped the employment-type filter`);
  }
  const country = optionalString(payload.country);
  if (country && !["US", "USA", "UNITED STATES", "UNITED STATES OF AMERICA"]
    .includes(country.toUpperCase())) {
    throw new Error(`Tesla job ${externalId} escaped the US filter`);
  }

  const expectedUrl = canonicalTeslaJobUrl(title, externalId);
  const suppliedUrl = optionalString(payload.url);
  const url = suppliedUrl
    ? validateTeslaJobUrl(suppliedUrl, externalId)
    : expectedUrl;
  // Tesla's route is deterministically derived from the current title. Reject
  // a mismatched same-ID path so an upstream routing change cannot silently
  // poison the canonical URL stored in D1.
  if (url !== expectedUrl) {
    throw new Error(`Tesla job ${externalId} returned a non-canonical public URL`);
  }

  const description = detailDescription(payload);
  if (!description) {
    throw new Error(`Tesla job ${externalId} returned no description`);
  }
  return {
    externalId,
    title,
    url,
    location,
    department,
    postedAt: detailPostedAt(payload, `job ${externalId}`),
    description,
    salary: extractSalaryFromHtml(description),
  };
}

function unsafeExternalId(externalId: string) {
  return !/^\d+$/.test(externalId);
}

async function fetchTeslaState() {
  const response = await fetchTeslaJson(
    TESLA_STATE_URL,
    "global state",
    TESLA_STATE_LIMIT_BYTES
  );
  if (response.status !== 200 || response.payload === null) {
    throw new Error(`Tesla Careers state API ${response.status}`);
  }
  return parseTeslaState(response.payload);
}

async function fetchTeslaDetail(externalId: string) {
  const response = await fetchTeslaJson(
    `${TESLA_DETAIL_ROOT}/${externalId}`,
    `job ${externalId}`,
    TESLA_DETAIL_LIMIT_BYTES
  );
  if (response.status === 404 || response.status === 410) return null;
  if (response.status !== 200 || response.payload === null) {
    throw new Error(`Tesla Careers job ${externalId} API ${response.status}`);
  }
  return mapTeslaJobDetail(response.payload, externalId);
}

export class TeslaAdapter implements ATSAdapter {
  name = TESLA_SOURCE;

  async fetchJobs(value: string): Promise<JobListing[]> {
    normalizeTeslaSource(value);
    return fetchTeslaState();
  }

  async fetchJobContent(
    value: string,
    externalId: string,
    jobUrl?: string
  ): Promise<JobContent> {
    normalizeTeslaSource(value);
    if (unsafeExternalId(externalId)) {
      throw new Error("Tesla job content requested with an unsafe requisition ID");
    }
    if (jobUrl !== undefined) validateTeslaJobUrl(jobUrl, externalId);
    const job = await fetchTeslaDetail(externalId);
    return job
      ? {
          description: job.description,
          salary: job.salary,
          location: job.location,
          postedAt: job.postedAt,
        }
      : { description: null, salary: null };
  }
}
