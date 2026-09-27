import type { ATSAdapter, JobContent, JobListing } from "./types";
import { extractSalaryFromHtml } from "./salary";
import { fetchWithTimeout } from "../http";

const APPLE_ORIGIN = "https://jobs.apple.com";
const APPLE_SOURCE = "apple";
const APPLE_LOCALE = "en-us";
const APPLE_API_LOCALE = "en_US";
const APPLE_COUNTRY = "USA";
const APPLE_US_LOCATION_ID = "postLocation-USA";
const PAGE_SIZE = 20;
// Normal scheduled polls only need the newest edge of Apple's sorted catalog:
// 200 location-expanded rows is ample headroom for the roles added between
// 15-minute ticks. The complete ~4,500-row snapshot remains available through
// fetchJobs for source verification, but repeatedly crawling it exceeded the
// scheduled Worker's hard 15-minute wall-time limit in production.
export const APPLE_DISCOVERY_PAGE_LIMIT = 10;
// Apple begins rate-limiting larger bursts even though every request is to the
// same public endpoint. Keep this deliberately conservative; Workers also cap
// simultaneous outbound connections, so a wider batch is not useful there.
const PAGE_CONCURRENCY = 2;
const SEARCH_REQUEST_ATTEMPTS = 4;
// A failed detail remains undiscovered and is retried by the next poll. Keeping
// this at one prevents a newly enabled large board from multiplying thousands
// of detail hydrations inside one Worker invocation.
const DETAIL_REQUEST_ATTEMPTS = 1;
const SNAPSHOT_ATTEMPTS = 3;
// This admits Apple's current ~4,500-job US catalog with modest growth room.
// Together with the absolute list-request budget and one detail attempt per
// listing, Apple can consume at most 5,800 external subrequests even if every
// listing is new and passes the poller's title prefilter. That leaves at least
// 4,200 of a Paid Worker's 10,000 subrequests for the other sources sharing the
// scheduled invocation. Normal current ingestion is ~227 list + ~459 details.
const APPLE_RESULT_SAFETY_LIMIT = 5_000;
const LIST_SUBREQUEST_BUDGET = 800;
const REQUEST_TIMEOUT_MS = 15_000;
const RESPONSE_BODY_TIMEOUT_MS = 15_000;
// Current live responses are roughly 10 KB for a 20-result search page and
// tens of KB for a detail page. These ceilings leave ample schema headroom but
// prevent an upstream error document or compromised response from consuming a
// Worker's 128 MB isolate through an unbounded response.json().
const SEARCH_RESPONSE_LIMIT_BYTES = 256 * 1024;
const DETAIL_RESPONSE_LIMIT_BYTES = 512 * 1024;

interface AppleSearchPage {
  total: number;
  jobs: Record<string, unknown>[];
}

interface ListRequestBudget {
  used: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function requiredString(
  value: unknown,
  field: string,
  context: string
): string {
  const parsed = optionalString(value);
  if (!parsed) throw new Error(`Apple job ${context} is missing ${field}`);
  return parsed;
}

export function normalizeAppleJobsSource(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error("Apple Jobs source is required");
  if (trimmed.toLowerCase() === APPLE_SOURCE) return APPLE_SOURCE;

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error('Apple Jobs source must be "apple" or a jobs.apple.com URL');
  }

  if (
    url.protocol !== "https:"
    || url.origin !== APPLE_ORIGIN
    || url.username
    || url.password
  ) {
    throw new Error("Apple Jobs source URL must use HTTPS jobs.apple.com");
  }
  return APPLE_SOURCE;
}

function appleHeaders(json = false): HeadersInit {
  return {
    accept: "application/json",
    ...(json ? { "content-type": "application/json" } : {}),
    locale: APPLE_API_LOCALE,
    countrycode: APPLE_COUNTRY,
    roveremaillocalecode: APPLE_API_LOCALE,
  };
}

function searchBody(page: number) {
  return {
    query: "",
    filters: { locations: [APPLE_US_LOCATION_ID] },
    page,
    locale: APPLE_LOCALE,
    sort: "newest",
    format: {
      longDate: "MMMM D, YYYY",
      mediumDate: "MMM D, YYYY",
    },
  };
}

function parseSearchPage(payload: unknown, page: number): AppleSearchPage {
  if (!isRecord(payload) || !isRecord(payload.res)) {
    throw new Error(`Apple Jobs returned an unexpected search payload for page ${page}`);
  }
  const total = payload.res.totalRecords;
  const jobs = payload.res.searchResults;
  if (
    typeof total !== "number"
    || !Number.isSafeInteger(total)
    || total < 0
    || !Array.isArray(jobs)
    || !jobs.every(isRecord)
  ) {
    throw new Error(`Apple Jobs returned an unexpected search payload for page ${page}`);
  }
  return { total, jobs };
}

async function boundedJson(
  response: Response,
  limitBytes: number,
  context: string
): Promise<unknown> {
  const contentLength = response.headers.get("content-length");
  if (contentLength !== null) {
    const advertised = Number(contentLength);
    if (
      !Number.isSafeInteger(advertised)
      || advertised < 0
      || advertised > limitBytes
    ) {
      await response.body?.cancel().catch(() => undefined);
      throw new Error(`Apple Jobs ${context} exceeded its response size limit`);
    }
  }

  if (!response.body) {
    throw new Error(`Apple Jobs returned an empty ${context} response`);
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      (async () => {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          received += value.byteLength;
          if (received > limitBytes) {
            throw new Error(`Apple Jobs ${context} exceeded its response size limit`);
          }
          chunks.push(value);
        }
      })(),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error(
          `Apple Jobs ${context} response body timed out after ${RESPONSE_BODY_TIMEOUT_MS}ms`
        )), RESPONSE_BODY_TIMEOUT_MS);
      }),
    ]);
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    if (timeout !== undefined) {
      clearTimeout(timeout);
    }
    reader.releaseLock();
  }

  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  } catch {
    throw new Error(`Apple Jobs returned invalid JSON for ${context}`);
  }
}

function retryDelay(response: Response, attempt: number) {
  const header = response.headers?.get?.("retry-after")?.trim();
  if (header && /^\d+(?:\.\d+)?$/.test(header)) {
    return Math.min(10_000, Math.max(0, Number(header) * 1000));
  }
  if (header) {
    const date = Date.parse(header);
    if (Number.isFinite(date)) return Math.min(10_000, Math.max(0, date - Date.now()));
  }
  return retryBackoff(attempt);
}

function retryBackoff(attempt: number) {
  return 750 * 2 ** (attempt - 1);
}

function transientStatus(status: number) {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

function reserveListSubrequest(budget: ListRequestBudget) {
  if (budget.used >= LIST_SUBREQUEST_BUDGET) {
    throw new Error(
      `Apple Jobs exhausted its ${LIST_SUBREQUEST_BUDGET}-subrequest list budget`
    );
  }
  budget.used += 1;
}

async function fetchSearchPage(
  page: number,
  budget: ListRequestBudget
): Promise<AppleSearchPage> {
  let lastStatus = 0;
  let lastRequestError: unknown;
  for (let attempt = 1; attempt <= SEARCH_REQUEST_ATTEMPTS; attempt += 1) {
    reserveListSubrequest(budget);
    let response: Response;
    try {
      response = await fetchWithTimeout(`${APPLE_ORIGIN}/api/v1/search`, {
        method: "POST",
        headers: appleHeaders(true),
        body: JSON.stringify(searchBody(page)),
      }, REQUEST_TIMEOUT_MS);
    } catch (error) {
      lastStatus = 0;
      lastRequestError = error;
      if (attempt < SEARCH_REQUEST_ATTEMPTS) {
        await new Promise((resolve) => setTimeout(resolve, retryBackoff(attempt)));
        continue;
      }
      break;
    }
    lastRequestError = undefined;
    if (response.ok) {
      return parseSearchPage(
        await boundedJson(
          response,
          SEARCH_RESPONSE_LIMIT_BYTES,
          `search page ${page}`
        ),
        page
      );
    }

    lastStatus = response.status;
    const delay = retryDelay(response, attempt);
    await response.body?.cancel().catch(() => undefined);
    if (!transientStatus(response.status) || attempt === SEARCH_REQUEST_ATTEMPTS) {
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
  if (lastRequestError !== undefined && lastStatus === 0) {
    throw new Error(
      `Apple Jobs search page ${page} request failed after ${SEARCH_REQUEST_ATTEMPTS} attempts`,
      { cause: lastRequestError }
    );
  }
  throw new Error(
    `Apple Jobs API ${lastStatus}${
      transientStatus(lastStatus) ? ` after ${SEARCH_REQUEST_ATTEMPTS} attempts` : ""
    }`
  );
}

function appleRequestId(posting: Record<string, unknown>) {
  const requestId = requiredString(posting.reqId, "reqId", "with unknown ID");
  if (!/^(?:PIPE-)?\d+(?:-\d+)?$/.test(requestId)) {
    throw new Error(`Apple job returned unsafe reqId ${requestId}`);
  }
  return requestId;
}

function publicRoleId(externalId: string) {
  const value = externalId.startsWith("PIPE-")
    ? externalId.slice("PIPE-".length)
    : externalId;
  if (!/^\d+(?:-\d+)?$/.test(value)) {
    throw new Error(`Apple job returned unsafe public role ID ${externalId}`);
  }
  return value;
}

function safeTitleSlug(value: string, externalId: string) {
  let decoded: string;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    throw new Error(`Apple job ${externalId} returned an unsafe title slug`);
  }
  if (
    !decoded.trim()
    || decoded === "."
    || decoded === ".."
    || decoded.length > 300
    || /[\/\\?#\u0000-\u001f\u007f]/.test(decoded)
  ) {
    throw new Error(`Apple job ${externalId} returned an unsafe title slug`);
  }
  // Apple's live feed percent-encodes non-ASCII title characters (including
  // its private-use logo glyph). Decode first so an encoded slash cannot sneak
  // through, then emit one canonical path segment.
  return encodeURIComponent(decoded).replace(/[!'()*]/g, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`
  );
}

function applePositionId(posting: Record<string, unknown>) {
  const requestId = appleRequestId(posting);
  const positionId = requiredString(posting.positionId, "positionId", requestId);
  if (!/^\d+$/.test(positionId)) {
    throw new Error(`Apple job ${requestId} returned unsafe positionId ${positionId}`);
  }
  const expectedBaseId = publicRoleId(requestId).split("-")[0];
  if (positionId !== expectedBaseId) {
    throw new Error(`Apple job ${requestId} returned mismatched positionId ${positionId}`);
  }
  return positionId;
}

function appleJobUrl(posting: Record<string, unknown>, externalId: string) {
  const positionId = applePositionId(posting);
  if (positionId !== externalId) {
    throw new Error(`Apple job ${externalId} returned mismatched positionId ${positionId}`);
  }

  const slug = safeTitleSlug(requiredString(
    posting.transformedPostingTitle,
    "transformedPostingTitle",
    externalId
  ), externalId);
  return `${APPLE_ORIGIN}/${APPLE_LOCALE}/details/${publicRoleId(externalId)}/${slug}`;
}

function isUsCountry(location: Record<string, unknown>) {
  const countryId = optionalString(location.countryID)?.toUpperCase();
  const countryName = optionalString(location.countryName)?.toLowerCase();
  const postLocationId = optionalString(location.postLocationId)
    ?? optionalString(location.postLocationCountryID);
  return countryId === "ISO-COUNTRY-USA"
    || postLocationId === APPLE_US_LOCATION_ID
    || countryName === "united states"
    || countryName === "united states of america";
}

function listingLocation(posting: Record<string, unknown>, externalId: string) {
  if (!Array.isArray(posting.locations) || !posting.locations.every(isRecord)) {
    throw new Error(`Apple job ${externalId} is missing structured locations`);
  }
  if (posting.locations.length === 0) {
    throw new Error(`Apple job ${externalId} is missing a United States location`);
  }

  const values = posting.locations.map((location) => {
    if (!isUsCountry(location)) {
      throw new Error(`Apple job ${externalId} escaped the configured US filter`);
    }
    const name = requiredString(location.name, "location name", externalId);
    const country = optionalString(location.countryName) ?? "United States";
    return /^united states(?: of america)?$/i.test(name)
      ? name
      : `${name}, ${country}`;
  });
  const unique = [...new Set(values)];
  const location = unique.join(" / ");
  return posting.homeOffice === true && !/\bremote\b/i.test(location)
    ? `Remote, ${location}`
    : location;
}

function isoDate(value: unknown): string | null {
  const raw = optionalString(value);
  if (!raw) return null;
  const time = Date.parse(raw);
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

function mapPosting(posting: Record<string, unknown>): JobListing {
  // `reqId` adds one location suffix per search result. All of those variants
  // share one Apple position, canonical detail payload, title, and posting
  // date. Using the suffix as identity duplicated multi-location roles in the
  // catalog and notification queue. `positionId` is the stable requisition.
  const externalId = applePositionId(posting);
  const team = isRecord(posting.team)
    ? optionalString(posting.team.teamName)
    : null;
  return {
    externalId,
    title: requiredString(posting.postingTitle, "postingTitle", externalId),
    url: appleJobUrl(posting, externalId),
    location: listingLocation(posting, externalId),
    department: team,
    postedAt: isoDate(posting.postDateInGMT),
    // Search summaries omit qualifications and compensation. Leaving content
    // empty makes the poller hydrate only newly discovered, in-scope roles.
    description: null,
    salary: null,
  };
}

class AppleSnapshotConsistencyError extends Error {}

function expectedPageLength(total: number, page: number) {
  return Math.min(PAGE_SIZE, Math.max(0, total - (page - 1) * PAGE_SIZE));
}

function validatePageLength(page: AppleSearchPage, pageNumber: number) {
  const expected = expectedPageLength(page.total, pageNumber);
  if (page.jobs.length !== expected) {
    throw new AppleSnapshotConsistencyError(
      `Apple Jobs page ${pageNumber} returned ${page.jobs.length} of ${expected} expected jobs`
    );
  }
}

function addPage(
  unique: Map<string, JobListing>,
  requestIds: Set<string>,
  page: AppleSearchPage,
  pageNumber: number,
  allowRepeatedRequestIds = false
) {
  validatePageLength(page, pageNumber);
  for (const posting of page.jobs) {
    const requestId = appleRequestId(posting);
    if (requestIds.has(requestId)) {
      // A new posting can shift page boundaries while a newest-first discovery
      // scan is in flight. Re-reading one boundary row is harmless there; the
      // authoritative full snapshot still fails closed on any duplicate.
      if (allowRepeatedRequestIds) continue;
      throw new AppleSnapshotConsistencyError(
        `Apple Jobs returned duplicate public ID ${requestId}`
      );
    }
    requestIds.add(requestId);

    const listing = mapPosting(posting);
    const current = unique.get(listing.externalId);
    if (!current) {
      unique.set(listing.externalId, listing);
      continue;
    }
    if (
      current.title !== listing.title
      || current.url !== listing.url
      || current.department !== listing.department
      || current.postedAt !== listing.postedAt
    ) {
      throw new AppleSnapshotConsistencyError(
        `Apple Jobs returned inconsistent variants for position ${listing.externalId}`
      );
    }

    const remote = /^remote\b/i.test(current.location)
      || /^remote\b/i.test(listing.location);
    const locations = [current.location, listing.location]
      .flatMap((value) => value.replace(/^Remote,\s*/i, "").split(/\s+\/\s+/))
      .filter((value, index, values) => value && values.indexOf(value) === index);
    current.location = `${remote ? "Remote, " : ""}${locations.join(" / ")}`;
  }
}

async function fetchAppleDiscoverySnapshot() {
  const budget: ListRequestBudget = { used: 0 };
  const firstPage = await fetchSearchPage(1, budget);
  if (firstPage.total >= APPLE_RESULT_SAFETY_LIMIT) {
    throw new Error(
      `Apple Jobs exceeded the ${APPLE_RESULT_SAFETY_LIMIT}-job safety limit`
    );
  }
  validatePageLength(firstPage, 1);
  if (firstPage.total === 0) return [];

  const pageCount = Math.min(
    APPLE_DISCOVERY_PAGE_LIMIT,
    Math.ceil(firstPage.total / PAGE_SIZE)
  );
  const unique = new Map<string, JobListing>();
  const requestIds = new Set<string>();
  addPage(unique, requestIds, firstPage, 1, true);

  const pages = Array.from({ length: pageCount - 1 }, (_, index) => index + 2);
  for (let index = 0; index < pages.length; index += PAGE_CONCURRENCY) {
    const batchNumbers = pages.slice(index, index + PAGE_CONCURRENCY);
    const batch = await Promise.all(
      batchNumbers.map((page) => fetchSearchPage(page, budget))
    );
    for (let batchIndex = 0; batchIndex < batch.length; batchIndex += 1) {
      addPage(
        unique,
        requestIds,
        batch[batchIndex],
        batchNumbers[batchIndex],
        true
      );
    }
  }

  return [...unique.values()];
}

function pageIdentity(page: AppleSearchPage) {
  return page.jobs.map(appleRequestId).join("\n");
}

async function fetchAppleSnapshotOnce(budget: ListRequestBudget) {
  const firstPage = await fetchSearchPage(1, budget);
  if (firstPage.total >= APPLE_RESULT_SAFETY_LIMIT) {
    throw new Error(
      `Apple Jobs exceeded the ${APPLE_RESULT_SAFETY_LIMIT}-job safety limit`
    );
  }
  validatePageLength(firstPage, 1);
  if (firstPage.total === 0) return [];

  const pageCount = Math.ceil(firstPage.total / PAGE_SIZE);
  const unique = new Map<string, JobListing>();
  const requestIds = new Set<string>();
  addPage(unique, requestIds, firstPage, 1);

  const pages = Array.from({ length: pageCount - 1 }, (_, index) => index + 2);
  for (let index = 0; index < pages.length; index += PAGE_CONCURRENCY) {
    const batchNumbers = pages.slice(index, index + PAGE_CONCURRENCY);
    const batch = await Promise.all(
      batchNumbers.map((page) => fetchSearchPage(page, budget))
    );
    for (let batchIndex = 0; batchIndex < batch.length; batchIndex += 1) {
      const pageNumber = batchNumbers[batchIndex];
      const page = batch[batchIndex];
      if (page.total !== firstPage.total) {
        throw new AppleSnapshotConsistencyError(
          `Apple Jobs result count changed during pagination (${firstPage.total} to ${page.total})`
        );
      }
      addPage(unique, requestIds, page, pageNumber);
    }
  }

  if (requestIds.size !== firstPage.total) {
    throw new AppleSnapshotConsistencyError(
      `Apple Jobs returned ${requestIds.size} of ${firstPage.total} expected jobs`
    );
  }

  // Count stability alone cannot detect a removal and insertion that happen to
  // cancel each other out. Re-reading the leading page catches the shifted
  // sort boundary that would otherwise make absence tracking unsafe.
  if (pageCount > 1) {
    const verification = await fetchSearchPage(1, budget);
    validatePageLength(verification, 1);
    if (
      verification.total !== firstPage.total
      || pageIdentity(verification) !== pageIdentity(firstPage)
    ) {
      throw new AppleSnapshotConsistencyError(
        "Apple Jobs leading page changed during pagination"
      );
    }
  }

  return [...unique.values()];
}

async function fetchAppleSnapshot() {
  const budget: ListRequestBudget = { used: 0 };
  let lastError: AppleSnapshotConsistencyError | null = null;
  for (let attempt = 1; attempt <= SNAPSHOT_ATTEMPTS; attempt += 1) {
    try {
      return await fetchAppleSnapshotOnce(budget);
    } catch (error) {
      if (!(error instanceof AppleSnapshotConsistencyError)) throw error;
      lastError = error;
    }
  }
  throw new Error(
    `Apple Jobs snapshot did not stabilize after ${SNAPSHOT_ATTEMPTS} attempts: ${
      lastError?.message ?? "unknown consistency error"
    }`
  );
}

function detailPublicRoleId(externalId: string, jobUrl?: string) {
  const expected = publicRoleId(externalId);
  if (!jobUrl) return expected;

  let url: URL;
  try {
    url = new URL(jobUrl);
  } catch {
    throw new Error("Apple job detail requires a valid public job URL");
  }
  if (
    url.protocol !== "https:"
    || url.origin !== APPLE_ORIGIN
    || url.username
    || url.password
  ) {
    throw new Error("Apple job URL does not match jobs.apple.com");
  }
  const parts = url.pathname.split("/").filter(Boolean);
  if (
    parts.length !== 4
    || parts[0] !== APPLE_LOCALE
    || parts[1] !== "details"
    || parts[2] !== expected
  ) {
    throw new Error("Apple job URL does not match its public role ID");
  }
  safeTitleSlug(parts[3], externalId);
  return expected;
}

function section(title: string, value: unknown) {
  const content = optionalString(value);
  return content ? `<h2>${title}</h2>${content}` : null;
}

function detailLocation(detail: Record<string, unknown>, externalId: string) {
  const locations = Array.isArray(detail.locations) && detail.locations.every(isRecord)
    ? detail.locations
    : [];
  if (locations.length === 0) return null;

  const values = locations.map((location) => {
    if (!isUsCountry(location)) {
      throw new Error(`Apple job ${externalId} detail escaped the configured US filter`);
    }
    const city = optionalString(location.city) ?? optionalString(location.name);
    const state = optionalString(location.stateProvince);
    const country = optionalString(location.countryName) ?? "United States";
    return [city, state, country].filter(Boolean).join(", ");
  });
  const value = [...new Set(values)].join(" / ") || null;
  return detail.homeOffice === true && value && !/\bremote\b/i.test(value)
    ? `Remote, ${value}`
    : value;
}

function footerContent(detail: Record<string, unknown>) {
  if (!Array.isArray(detail.postingFooters)) return "";
  const values: string[] = [];
  for (const footer of detail.postingFooters) {
    if (!isRecord(footer) || !isRecord(footer.localizations)) continue;
    for (const entries of Object.values(footer.localizations)) {
      if (!Array.isArray(entries)) continue;
      for (const entry of entries) {
        if (!isRecord(entry)) continue;
        const content = optionalString(entry.content);
        if (content) values.push(content);
      }
    }
  }
  return values.join("\n");
}

function appleSalary(detail: Record<string, unknown>) {
  const content = footerContent(detail).replace(
    /\bbetween\s+(\$[\d,]+(?:\.\d{2})?)\s+and\s+(\$[\d,]+(?:\.\d{2})?)/gi,
    "$1 - $2"
  );
  return extractSalaryFromHtml(content);
}

export class AppleJobsAdapter implements ATSAdapter {
  readonly name = "apple";

  async fetchDiscoveryJobs(value: string): Promise<JobListing[]> {
    normalizeAppleJobsSource(value);
    return fetchAppleDiscoverySnapshot();
  }

  async fetchJobs(value: string): Promise<JobListing[]> {
    normalizeAppleJobsSource(value);
    return fetchAppleSnapshot();
  }

  async fetchJobContent(
    value: string,
    externalId: string,
    jobUrl?: string
  ): Promise<JobContent> {
    normalizeAppleJobsSource(value);
    const roleId = detailPublicRoleId(externalId, jobUrl);
    const url = new URL(`/api/v1/jobDetails/${encodeURIComponent(roleId)}`, APPLE_ORIGIN);
    url.searchParams.set("locale", APPLE_LOCALE);
    let payload: unknown;
    let lastStatus = 0;
    let lastRequestError: unknown;
    for (let attempt = 1; attempt <= DETAIL_REQUEST_ATTEMPTS; attempt += 1) {
      let response: Response;
      try {
        response = await fetchWithTimeout(
          url,
          { headers: appleHeaders() },
          REQUEST_TIMEOUT_MS
        );
      } catch (error) {
        lastStatus = 0;
        lastRequestError = error;
        if (attempt < DETAIL_REQUEST_ATTEMPTS) {
          await new Promise((resolve) => setTimeout(resolve, retryBackoff(attempt)));
          continue;
        }
        break;
      }
      lastRequestError = undefined;
      if (response.ok) {
        payload = await boundedJson(
          response,
          DETAIL_RESPONSE_LIMIT_BYTES,
          `detail ${externalId}`
        );
        break;
      }

      lastStatus = response.status;
      const delay = retryDelay(response, attempt);
      await response.body?.cancel().catch(() => undefined);
      if (response.status === 404 || response.status === 410) {
        return { description: null, salary: null };
      }
      if (!transientStatus(response.status)) {
        throw new Error(`Apple Jobs detail ${externalId} API ${response.status}`);
      }
      if (attempt < DETAIL_REQUEST_ATTEMPTS) {
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
    if (payload === undefined) {
      if (lastRequestError !== undefined && lastStatus === 0) {
        throw new Error(
          `Apple Jobs detail ${externalId} request failed after ${DETAIL_REQUEST_ATTEMPTS} attempts`,
          { cause: lastRequestError }
        );
      }
      throw new Error(
        `Apple Jobs detail ${externalId} API ${lastStatus} after ${DETAIL_REQUEST_ATTEMPTS} attempts`
      );
    }
    if (!isRecord(payload) || !isRecord(payload.res)) {
      throw new Error(`Apple Jobs returned an unexpected detail payload for ${externalId}`);
    }
    const detail = payload.res;
    if (requiredString(detail.jobNumber, "jobNumber", externalId) !== roleId) {
      throw new Error(`Apple job detail did not match public role ID ${externalId}`);
    }

    const description = [
      section("Summary", detail.jobSummary),
      section("Description", detail.description),
      section("Minimum Qualifications", detail.minimumQualifications),
      section("Preferred Qualifications", detail.preferredQualifications),
      section("Education & Experience", detail.educationExperience),
      section("Additional Requirements", detail.additionalRequirements),
    ].filter((value): value is string => Boolean(value)).join("\n") || null;

    return {
      description,
      salary: appleSalary(detail),
      location: detailLocation(detail, externalId),
      postedAt: isoDate(detail.longPostingDate) ?? isoDate(detail.postDateInGMT),
    };
  }
}
