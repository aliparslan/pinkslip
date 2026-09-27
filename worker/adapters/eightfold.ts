import type { ATSAdapter, JobContent, JobListing } from "./types";
import { extractSalaryFromHtml } from "./salary";
import { fetchWithTimeout } from "../http";

const PAGE_SIZE = 10;
// Workers permits at most six simultaneous outgoing connections per request.
const PAGE_CONCURRENCY = 6;
const SNAPSHOT_ATTEMPTS = 2;
const TRANSPORT_ATTEMPTS = 2;
const EIGHTFOLD_RESULT_CAP = 600;
// Measured decoded maxima: PayPal 19,742 bytes; Netflix 22,810 bytes. 128 KiB
// leaves 5.7x headroom (and covers Eaton's observed 67 KiB facet payload)
// while six companies × six list readers stay near 4.5 MiB raw in flight.
const MAX_LIST_RESPONSE_BYTES = 128 * 1024;
// Detail responses carry descriptions but are fetched only for discovered
// candidates. This separately bounds 36 possible readers at 18 MiB raw.
const MAX_DETAIL_RESPONSE_BYTES = 512 * 1024;
const MAX_DESCRIPTION_CHARS = 500_000;
const REQUEST_TIMEOUT_MS = 3_000;
const BODY_READ_TIMEOUT_MS = 3_000;
const DEFAULT_RETRY_DELAY_MS = 100;
const MAX_RETRY_AFTER_MS = 250;

// A 600-row board is at most 60 data pages. Two full verification scans, two
// consistency attempts, and two transport attempts cap PCSX at 480 upstream
// requests. Classic adds one generation probe per scan, for an absolute 488.
// With six pages in flight, classic is at most 12 serial request stages per
// scan. Four scans × 12 stages × (3s headers + 3s body + 250ms retry + 3s
// headers + 3s body) = 588 seconds (9m48s), leaving 5m12s of a 15-minute cron
// window. Network and Retry-After waits consume no Worker CPU time.

type EightfoldGeneration = "pcsx" | "classic";

interface EightfoldSource {
  origin: string;
  tenant: string;
  groupId: string;
  boardUrl: string;
}

interface EightfoldPage {
  count: number;
  positions: Record<string, unknown>[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isDnsName(value: string) {
  if (!value || value.length > 253 || value.endsWith(".")) return false;
  return value.split(".").every((label) =>
    label.length > 0
    && label.length <= 63
    && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(label)
  );
}

export function parseEightfoldSource(value: string): EightfoldSource {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error(
      "Eightfold source must be a full HTTPS tenant board URL with a domain parameter"
    );
  }

  const hostParts = url.hostname.toLowerCase().split(".");
  const tenant = hostParts[0] ?? "";
  if (
    url.protocol !== "https:"
    || url.username
    || url.password
    || url.port
    || hostParts.length !== 3
    || hostParts[1] !== "eightfold"
    || hostParts[2] !== "ai"
    || !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(tenant)
  ) {
    throw new Error(
      "Eightfold source must use an HTTPS {tenant}.eightfold.ai host"
    );
  }

  if (!/^\/careers(?:\/.*)?$/.test(url.pathname)) {
    throw new Error("Eightfold source URL must use the tenant's /careers board");
  }

  const groupIds = url.searchParams.getAll("domain");
  const groupId = groupIds[0]?.trim().toLowerCase() ?? "";
  if (groupIds.length !== 1 || !isDnsName(groupId)) {
    throw new Error(
      "Eightfold source URL must include exactly one valid domain parameter"
    );
  }

  const origin = `https://${url.hostname.toLowerCase()}`;
  const board = new URL("/careers", origin);
  board.searchParams.set("domain", groupId);
  return { origin, tenant, groupId, boardUrl: board.toString() };
}

export function normalizeEightfoldSource(value: string) {
  return parseEightfoldSource(value).boardUrl;
}

class EightfoldHttpError extends Error {
  constructor(
    readonly status: number,
    readonly payload: unknown,
    context: string
  ) {
    super(`Eightfold ${context} API ${status}`);
  }
}

class EightfoldSnapshotConsistencyError extends Error {}
class EightfoldResponseLimitError extends Error {}
class EightfoldBodyReadTimeoutError extends Error {}

export async function readBoundedEightfoldText(
  response: Response,
  context: string,
  timeoutMs = BODY_READ_TIMEOUT_MS,
  maxResponseBytes = MAX_DETAIL_RESPONSE_BYTES
) {
  const declaredLength = response.headers.get("content-length");
  if (declaredLength !== null) {
    const bytes = Number(declaredLength);
    if (Number.isFinite(bytes) && bytes > maxResponseBytes) {
      await response.body?.cancel();
      throw new EightfoldResponseLimitError(
        `Eightfold ${context} response exceeded ${maxResponseBytes} bytes`
      );
    }
  }

  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let byteCount = 0;
  let text = "";
  let timedOut = false;
  const timeoutError = new EightfoldBodyReadTimeoutError(
    `Eightfold ${context} body did not complete within ${timeoutMs}ms`
  );
  const timeout = setTimeout(() => {
    timedOut = true;
    void reader.cancel(timeoutError).catch(() => undefined);
  }, timeoutMs);

  try {
    while (true) {
      let chunk: ReadableStreamReadResult<Uint8Array>;
      try {
        chunk = await reader.read();
      } catch (error) {
        if (timedOut) throw timeoutError;
        throw error;
      }
      if (timedOut) throw timeoutError;
      if (chunk.done) break;
      byteCount += chunk.value.byteLength;
      if (byteCount > maxResponseBytes) {
        await reader.cancel();
        throw new EightfoldResponseLimitError(
          `Eightfold ${context} response exceeded ${maxResponseBytes} bytes`
        );
      }
      text += decoder.decode(chunk.value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    clearTimeout(timeout);
  }
}

function transientStatus(status: number) {
  return status === 408
    || status === 425
    || status === 429
    || (status >= 500 && status <= 599);
}

export function eightfoldRetryDelayMs(
  retryAfterValue: string | null,
  nowMs = Date.now()
) {
  const retryAfter = retryAfterValue?.trim() ?? "";
  let requestedDelay = DEFAULT_RETRY_DELAY_MS;
  if (/^\d+$/.test(retryAfter)) {
    requestedDelay = Number(retryAfter) * 1_000;
  } else if (retryAfter) {
    const retryAt = Date.parse(retryAfter);
    if (Number.isFinite(retryAt)) requestedDelay = Math.max(0, retryAt - nowMs);
  }
  return Math.min(MAX_RETRY_AFTER_MS, requestedDelay);
}

async function waitBeforeRetry(delayMs: number) {
  if (delayMs <= 0) return;
  await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
}

async function fetchJson(
  url: URL,
  context: string,
  maxResponseBytes: number
): Promise<unknown> {
  let lastNetworkError: unknown = null;
  for (let attempt = 1; attempt <= TRANSPORT_ATTEMPTS; attempt += 1) {
    let response: Response;
    let text: string;
    try {
      response = await fetchWithTimeout(url, {
        headers: {
          accept: "application/json",
        },
      }, REQUEST_TIMEOUT_MS);
      text = await readBoundedEightfoldText(
        response,
        context,
        BODY_READ_TIMEOUT_MS,
        maxResponseBytes
      );
    } catch (error) {
      if (error instanceof EightfoldResponseLimitError) throw error;
      lastNetworkError = error;
      if (attempt === TRANSPORT_ATTEMPTS) throw error;
      await waitBeforeRetry(DEFAULT_RETRY_DELAY_MS);
      continue;
    }

    let payload: unknown = null;
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        if (response.ok) {
          throw new Error(`Eightfold ${context} returned invalid JSON`);
        }
      }
    }
    if (!response.ok) {
      const error = new EightfoldHttpError(response.status, payload, context);
      if (!transientStatus(response.status) || attempt === TRANSPORT_ATTEMPTS) {
        throw error;
      }
      await waitBeforeRetry(eightfoldRetryDelayMs(response.headers.get("retry-after")));
      continue;
    }
    return payload;
  }
  throw lastNetworkError ?? new Error(`Eightfold ${context} request failed`);
}

function searchUrl(
  source: EightfoldSource,
  generation: EightfoldGeneration,
  start: number
) {
  const path = generation === "pcsx"
    ? "/api/pcsx/search"
    : "/api/apply/v2/jobs";
  const url = new URL(path, source.origin);
  url.searchParams.set("domain", source.groupId);
  url.searchParams.set("query", "");
  url.searchParams.set("location", "");
  url.searchParams.set("start", String(start));
  // `timestamp` produced a stable, exact duplicate across adjacent PayPal
  // pages (and therefore omitted a different row from the advertised count).
  // The board's relevance order was byte-for-byte stable across repeated full
  // snapshots and returned every public ID exactly once. Consistency retries
  // below still fail closed if that ordering shifts during a future poll.
  url.searchParams.set("sort_by", "relevance");
  if (generation === "pcsx") {
    url.searchParams.set("filter_include_remote", "1");
  } else {
    url.searchParams.set("num", String(PAGE_SIZE));
  }
  return url;
}

function parsePage(
  payload: unknown,
  generation: EightfoldGeneration,
  context: string
): EightfoldPage {
  if (!isRecord(payload)) {
    throw new Error(`Eightfold returned an unexpected payload for ${context}`);
  }

  const body = generation === "pcsx" ? payload.data : payload;
  if (!isRecord(body)) {
    throw new Error(`Eightfold returned an unexpected payload for ${context}`);
  }
  if (
    generation === "pcsx"
    && payload.status !== undefined
    && payload.status !== 200
  ) {
    throw new Error(`Eightfold returned an unexpected status for ${context}`);
  }

  const count = body.count;
  const positions = body.positions;
  if (
    typeof count !== "number"
    || !Number.isSafeInteger(count)
    || count < 0
    || !Array.isArray(positions)
    || positions.length > PAGE_SIZE
    || !positions.every(isRecord)
  ) {
    throw new Error(`Eightfold returned an unexpected payload for ${context}`);
  }
  return { count, positions };
}

async function fetchPage(
  source: EightfoldSource,
  generation: EightfoldGeneration,
  start: number
) {
  return parsePage(
    await fetchJson(
      searchUrl(source, generation, start),
      `${generation} search`,
      MAX_LIST_RESPONSE_BYTES
    ),
    generation,
    `${generation} offset ${start}`
  );
}

function pcsxIsDisabled(error: unknown) {
  if (!(error instanceof EightfoldHttpError) || error.status !== 403) return false;
  const message = isRecord(error.payload) && typeof error.payload.message === "string"
    ? error.payload.message
    : "";
  return /pcsx/i.test(message) && /(?:not enabled|disabled)/i.test(message);
}

function optionalString(value: unknown, context: string, maxLength = 1_000) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") {
    throw new Error(`Eightfold ${context} must be a string`);
  }
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > maxLength) {
    throw new Error(`Eightfold ${context} exceeded ${maxLength} characters`);
  }
  return trimmed;
}

function positionId(position: Record<string, unknown>) {
  const value = position.id;
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) {
    return String(value);
  }
  if (typeof value === "string" && /^\d{1,25}$/.test(value)) return value;
  throw new Error("Eightfold position is missing a valid numeric ID");
}

function requiredTitle(position: Record<string, unknown>, externalId: string) {
  const title = optionalString(position.name, `position ${externalId} title`);
  if (!title) throw new Error(`Eightfold position ${externalId} is missing its title`);
  return title;
}

function stringArray(value: unknown, context: string) {
  if (value === null || value === undefined) return [];
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    throw new Error(`Eightfold ${context} must be an array of strings`);
  }
  return value
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      if (item.length > 1_000) {
        throw new Error(`Eightfold ${context} contained an oversized value`);
      }
      return item;
    });
}

function positionLocation(
  position: Record<string, unknown>,
  externalId: string
): string;
function positionLocation(
  position: Record<string, unknown>,
  externalId: string,
  fallback: null
): string | null;
function positionLocation(
  position: Record<string, unknown>,
  externalId: string,
  fallback: string | null = "Unknown"
) {
  const standardized = stringArray(
    position.standardizedLocations,
    `position ${externalId} standardized locations`
  );
  const original = stringArray(
    position.locations,
    `position ${externalId} locations`
  );
  const scalar = optionalString(
    position.location,
    `position ${externalId} location`
  );
  // Prefer the employer/ATS location. Netflix currently returns
  // `locations: ["USA - Remote"]` but a contradictory PCSX
  // `standardizedLocations: ["Panamá, ..."]` for the same ID and title.
  // Standardized values remain useful only when the original is absent.
  const candidates = original.length > 0
    ? original
    : standardized.length > 0
      ? standardized
      : scalar
        ? [scalar]
        : [];
  const seen = new Set<string>();
  const locations = candidates.filter((location) => {
    const key = location.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  let location = locations.join(" / ") || fallback;
  const workMode = optionalString(
    position.workLocationOption ?? position.work_location_option,
    `position ${externalId} work-location option`
  );
  if (location && workMode && /remote/i.test(workMode) && !/\bremote\b/i.test(location)) {
    location = `Remote — ${location}`;
  }
  return location;
}

function positionPostedAt(position: Record<string, unknown>, externalId: string) {
  const value = position.postedTs
    ?? position.posted_ts
    ?? position.t_update
    ?? position.creationTs
    ?? position.t_create;
  if (value === null || value === undefined) return null;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`Eightfold position ${externalId} has an invalid timestamp`);
  }
  const date = new Date(value * 1_000);
  if (!Number.isFinite(date.getTime())) {
    throw new Error(`Eightfold position ${externalId} has an invalid timestamp`);
  }
  return date.toISOString();
}

function jobUrl(source: EightfoldSource, externalId: string) {
  const url = new URL(`/careers/job/${externalId}`, source.origin);
  url.searchParams.set("domain", source.groupId);
  return url.toString();
}

function mapPosition(
  source: EightfoldSource,
  position: Record<string, unknown>
): JobListing {
  const externalId = positionId(position);
  return {
    externalId,
    title: requiredTitle(position, externalId),
    url: jobUrl(source, externalId),
    location: positionLocation(position, externalId),
    department: optionalString(
      position.department,
      `position ${externalId} department`
    ),
    postedAt: positionPostedAt(position, externalId),
    // List responses can repeat large descriptions on every page. Hydrate only
    // newly discovered jobs from the bounded per-position endpoint instead.
    description: null,
    salary: null,
  };
}

function addPositions(
  source: EightfoldSource,
  generation: EightfoldGeneration,
  unique: Map<string, JobListing>,
  positions: Record<string, unknown>[]
) {
  for (const position of positions) {
    const listing = mapPosition(source, position);
    if (unique.has(listing.externalId)) {
      throw new EightfoldSnapshotConsistencyError(
        `Eightfold ${generation} returned duplicate public ID ${listing.externalId}`
      );
    }
    unique.set(listing.externalId, listing);
  }
}

function ensureWithinResultCap(count: number, generation: EightfoldGeneration) {
  if (count > EIGHTFOLD_RESULT_CAP) {
    throw new Error(
      `Eightfold ${generation} board exceeds the ${EIGHTFOLD_RESULT_CAP}-job result cap (${count})`
    );
  }
}

async function fetchCountedSnapshot(
  source: EightfoldSource,
  generation: EightfoldGeneration,
  firstPage: EightfoldPage
) {
  ensureWithinResultCap(firstPage.count, generation);
  if (firstPage.count === 0) {
    if (firstPage.positions.length !== 0) {
      throw new EightfoldSnapshotConsistencyError(
        `Eightfold ${generation} returned jobs for a zero-result snapshot`
      );
    }
    return [];
  }

  const unique = new Map<string, JobListing>();
  let rawCount = firstPage.positions.length;
  addPositions(source, generation, unique, firstPage.positions);
  const offsets: number[] = [];
  for (let start = PAGE_SIZE; start < firstPage.count; start += PAGE_SIZE) {
    offsets.push(start);
  }

  for (let index = 0; index < offsets.length; index += PAGE_CONCURRENCY) {
    const pages = await Promise.all(
      offsets.slice(index, index + PAGE_CONCURRENCY).map((start) =>
        fetchPage(source, generation, start)
      )
    );
    for (const page of pages) {
      if (page.count !== firstPage.count) {
        throw new EightfoldSnapshotConsistencyError(
          `Eightfold ${generation} result count changed during pagination (${firstPage.count} to ${page.count})`
        );
      }
      rawCount += page.positions.length;
      addPositions(source, generation, unique, page.positions);
    }
  }

  if (rawCount !== firstPage.count) {
    throw new EightfoldSnapshotConsistencyError(
      `Eightfold ${generation} returned ${rawCount} of ${firstPage.count} expected jobs`
    );
  }
  return [...unique.values()];
}

async function fetchClassicProgressiveSnapshot(
  source: EightfoldSource,
  firstPage: EightfoldPage
) {
  const unique = new Map<string, JobListing>();
  addPositions(source, "classic", unique, firstPage.positions);
  let lastPage = firstPage;
  let start = PAGE_SIZE;

  while (lastPage.positions.length === PAGE_SIZE) {
    if (unique.size >= EIGHTFOLD_RESULT_CAP) {
      throw new Error(
        `Eightfold classic board reached the ${EIGHTFOLD_RESULT_CAP}-job result cap before pagination ended`
      );
    }
    lastPage = await fetchPage(source, "classic", start);
    ensureWithinResultCap(lastPage.count, "classic");
    addPositions(source, "classic", unique, lastPage.positions);
    start += PAGE_SIZE;
  }
  return [...unique.values()];
}

async function fetchSnapshotOnce(source: EightfoldSource) {
  let firstPage: EightfoldPage;
  try {
    firstPage = await fetchPage(source, "pcsx", 0);
    return {
      generation: "pcsx" as const,
      jobs: await fetchCountedSnapshot(source, "pcsx", firstPage),
    };
  } catch (error) {
    if (!pcsxIsDisabled(error)) throw error;
  }

  firstPage = await fetchPage(source, "classic", 0);
  ensureWithinResultCap(firstPage.count, "classic");
  if (firstPage.count === 0 && firstPage.positions.length !== 0) {
    throw new EightfoldSnapshotConsistencyError(
      "Eightfold classic returned jobs for a zero-result snapshot"
    );
  }
  if (firstPage.count > firstPage.positions.length) {
    return {
      generation: "classic" as const,
      jobs: await fetchCountedSnapshot(source, "classic", firstPage),
    };
  }
  if (firstPage.count < firstPage.positions.length) {
    throw new EightfoldSnapshotConsistencyError(
      `Eightfold classic returned ${firstPage.positions.length} jobs for a count of ${firstPage.count}`
    );
  }
  return {
    generation: "classic" as const,
    jobs: await fetchClassicProgressiveSnapshot(source, firstPage),
  };
}

async function fetchStableSnapshot(source: EightfoldSource) {
  let lastError: EightfoldSnapshotConsistencyError | null = null;
  for (let attempt = 1; attempt <= SNAPSHOT_ATTEMPTS; attempt += 1) {
    try {
      const snapshot = await fetchSnapshotOnce(source);
      const verification = await fetchSnapshotOnce(source);
      const expectedIds = new Set(snapshot.jobs.map((job) => job.externalId));
      const verificationIds = new Set(verification.jobs.map((job) => job.externalId));
      if (
        snapshot.generation !== verification.generation
        || snapshot.jobs.length !== verification.jobs.length
        || expectedIds.size !== verificationIds.size
        || [...expectedIds].some((externalId) => !verificationIds.has(externalId))
      ) {
        throw new EightfoldSnapshotConsistencyError(
          "Eightfold public IDs changed between complete verification scans"
        );
      }
      return snapshot;
    } catch (error) {
      if (!(error instanceof EightfoldSnapshotConsistencyError)) throw error;
      lastError = error;
    }
  }
  throw new Error(
    `Eightfold snapshot did not stabilize after ${SNAPSHOT_ATTEMPTS} attempts: ${
      lastError?.message ?? "unknown consistency error"
    }`
  );
}

async function detectGeneration(source: EightfoldSource): Promise<EightfoldGeneration> {
  try {
    await fetchPage(source, "pcsx", 0);
    return "pcsx";
  } catch (error) {
    if (pcsxIsDisabled(error)) return "classic";
    throw error;
  }
}

function validateExternalId(externalId: string) {
  if (!/^\d{1,25}$/.test(externalId)) {
    throw new Error("Eightfold job detail requires a numeric position ID");
  }
}

function validateJobUrl(
  source: EightfoldSource,
  externalId: string,
  rawJobUrl: string | undefined
) {
  if (!rawJobUrl) return;
  let url: URL;
  try {
    url = new URL(rawJobUrl);
  } catch {
    throw new Error("Eightfold job URL is invalid");
  }
  const pathId = url.pathname.match(/^\/careers\/job\/(\d{1,25})\/?$/)?.[1];
  const queryId = url.pathname === "/careers"
    ? url.searchParams.get("pid")
    : null;
  if (
    url.protocol !== "https:"
    || url.origin !== source.origin
    || url.username
    || url.password
    || (pathId ?? queryId) !== externalId
  ) {
    throw new Error("Eightfold job URL does not match its configured tenant");
  }
}

function detailUrl(
  source: EightfoldSource,
  generation: EightfoldGeneration,
  externalId: string
) {
  const path = generation === "pcsx"
    ? "/api/pcsx/position_details"
    : `/api/apply/v2/jobs/${externalId}`;
  const url = new URL(path, source.origin);
  url.searchParams.set("domain", source.groupId);
  if (generation === "pcsx") {
    url.searchParams.set("position_id", externalId);
    url.searchParams.set("hl", "en");
  }
  return url;
}

function normalizeClassicDetail(position: Record<string, unknown>) {
  return {
    ...position,
    // Classic `t_update` changes when the ATS record is edited; `t_create` is
    // the original publication/creation time and is the correct freshness
    // value to preserve when detail hydration merges back into the list row.
    postedTs: position.t_create ?? position.t_update,
    creationTs: position.t_create,
    workLocationOption: position.work_location_option,
    jobDescription: position.job_description,
  };
}

function parseDetail(payload: unknown, generation: EightfoldGeneration) {
  if (!isRecord(payload)) {
    throw new Error(`Eightfold ${generation} detail returned an unexpected payload`);
  }
  if (generation === "classic") return normalizeClassicDetail(payload);
  const data = payload.data;
  if (!isRecord(data)) {
    throw new Error("Eightfold pcsx detail returned an unexpected payload");
  }
  return isRecord(data.position) ? data.position : data;
}

async function fetchDetail(
  source: EightfoldSource,
  generation: EightfoldGeneration,
  externalId: string
) {
  const payload = await fetchJson(
    detailUrl(source, generation, externalId),
    `${generation} detail`,
    MAX_DETAIL_RESPONSE_BYTES
  );
  return parseDetail(payload, generation);
}

function mapDetail(
  position: Record<string, unknown>,
  externalId: string
): JobContent {
  if (positionId(position) !== externalId) {
    throw new Error("Eightfold detail returned a different position ID");
  }
  const description = optionalString(
    position.jobDescription,
    `position ${externalId} description`,
    MAX_DESCRIPTION_CHARS
  );
  return {
    description,
    salary: extractSalaryFromHtml(description),
    // Do not replace a trustworthy list location with "Unknown" when a tenant
    // omits location metadata from its detail response.
    location: positionLocation(position, externalId, null),
    postedAt: positionPostedAt(position, externalId),
  };
}

export class EightfoldAdapter implements ATSAdapter {
  readonly name = "eightfold";
  // Adapter instances are created per company poll. Remembering the generation
  // here lets detail hydration reuse the generation established by the verified
  // list scan without module-global request state or one probe per new job.
  private generation: EightfoldGeneration | null = null;

  async fetchJobs(value: string): Promise<JobListing[]> {
    const snapshot = await fetchStableSnapshot(parseEightfoldSource(value));
    this.generation = snapshot.generation;
    return snapshot.jobs;
  }

  async fetchJobContent(
    value: string,
    externalId: string,
    rawJobUrl?: string
  ): Promise<JobContent> {
    const source = parseEightfoldSource(value);
    validateExternalId(externalId);
    validateJobUrl(source, externalId, rawJobUrl);

    const generation = this.generation ?? await detectGeneration(source);
    this.generation = generation;
    let position: Record<string, unknown>;
    try {
      position = await fetchDetail(source, generation, externalId);
    } catch (error) {
      if (error instanceof EightfoldHttpError && error.status === 404) {
        return { description: null, salary: null };
      }
      throw error;
    }
    return mapDetail(position, externalId);
  }
}
