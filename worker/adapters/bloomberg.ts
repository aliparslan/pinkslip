import type { ATSAdapter, JobContent, JobListing } from "./types";
import { extractSalaryFromHtml } from "./salary";
import { fetchWithTimeout } from "../http";

const BLOOMBERG_ORIGIN = "https://bloomberg.avature.net";
const BLOOMBERG_SOURCE = "bloomberg";
const PAGE_SIZE = 12;
const PAGE_CONCURRENCY = 4;
const SNAPSHOT_ATTEMPTS = 3;
const MAX_RESULTS = 1_200;
const MAX_HTML_BYTES = 2_000_000;
const TITLE_SORT_FIELD = "schemaField_3_270_3";
const BODY_TIMEOUT_MS = 15_000;
const UPSTREAM_ATTEMPTS = 3;
const BASE_RETRY_DELAY_MS = 250;
const MAX_RETRY_DELAY_MS = 5_000;

class BloombergSnapshotConsistencyError extends Error {}
class BloombergBodyTimeoutError extends Error {}

function attribute(tag: string, name: string): string | null {
  const match = tag.match(new RegExp(
    `\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`,
    "i"
  ));
  return match ? (match[1] ?? match[2] ?? null) : null;
}

function hasClass(tag: string, className: string) {
  return (attribute(tag, "class") ?? "")
    .split(/\s+/)
    .includes(className);
}

/**
 * Extract balanced HTML elements without relying on DOMParser, which is not
 * available in the Workers runtime. Avature's result and detail templates use
 * nested divs, so a non-greedy `.*?</div>` would truncate the rich text.
 */
function elementsByClass(html: string, tagName: string, className: string) {
  const results: string[] = [];
  const opening = new RegExp(`<${tagName}\\b[^>]*>`, "gi");
  let match: RegExpExecArray | null;

  while ((match = opening.exec(html))) {
    if (!hasClass(match[0], className)) continue;

    const start = opening.lastIndex;
    const tokens = new RegExp(`<\\/?${tagName}\\b[^>]*>`, "gi");
    tokens.lastIndex = start;
    let depth = 1;
    let token: RegExpExecArray | null;
    let closed = false;

    while ((token = tokens.exec(html))) {
      if (/^<\//.test(token[0])) depth -= 1;
      else depth += 1;
      if (depth !== 0) continue;

      results.push(html.slice(start, token.index));
      opening.lastIndex = tokens.lastIndex;
      closed = true;
      break;
    }

    if (!closed) {
      throw new Error(`Bloomberg Careers returned unbalanced ${tagName} markup`);
    }
  }

  return results;
}

const HTML_ENTITIES: Record<string, string> = {
  amp: "&",
  apos: "'",
  gt: ">",
  hellip: "…",
  ldquo: "“",
  lsquo: "‘",
  lt: "<",
  mdash: "—",
  nbsp: " ",
  ndash: "–",
  quot: '"',
  rdquo: "”",
  rsquo: "’",
};

function decodeHtml(value: string) {
  return value.replace(/&(#(?:x[0-9a-f]+|\d+)|[a-z][a-z0-9]+);/gi, (entity, code: string) => {
    if (code[0] !== "#") return HTML_ENTITIES[code.toLowerCase()] ?? entity;
    const hexadecimal = code[1]?.toLowerCase() === "x";
    const point = Number.parseInt(code.slice(hexadecimal ? 2 : 1), hexadecimal ? 16 : 10);
    return Number.isSafeInteger(point) && point > 0 && point <= 0x10ffff
      ? String.fromCodePoint(point)
      : entity;
  });
}

function htmlText(value: string) {
  return decodeHtml(value
    .replace(/<(?:br|hr)\b[^>]*>/gi, "\n")
    .replace(/<\/(?:p|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

async function cancelResponseBody(response: Response) {
  if (!response.body) return;
  await response.body.cancel().catch(() => undefined);
}

export async function readBoundedBloombergHtml(
  response: Response,
  context: string,
  timeoutMs = BODY_TIMEOUT_MS
) {
  const contentType = response.headers.get("content-type");
  if (contentType && !/^text\/html\b/i.test(contentType)) {
    await cancelResponseBody(response);
    throw new Error(`Bloomberg Careers returned ${contentType} for ${context}`);
  }
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_HTML_BYTES) {
    await cancelResponseBody(response);
    throw new Error(`Bloomberg Careers response exceeded ${MAX_HTML_BYTES} bytes for ${context}`);
  }
  if (!response.body) return "";

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      reject(new BloombergBodyTimeoutError(
        `Bloomberg Careers body timed out after ${timeoutMs}ms for ${context}`
      ));
    }, timeoutMs);
  });
  let bytes = 0;
  let html = "";
  try {
    while (true) {
      const chunk = await Promise.race([reader.read(), deadline]);
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > MAX_HTML_BYTES) {
        throw new Error(`Bloomberg Careers response exceeded ${MAX_HTML_BYTES} bytes for ${context}`);
      }
      html += decoder.decode(chunk.value, { stream: true });
    }
    return html + decoder.decode();
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}

function isTransientStatus(status: number) {
  return status === 408
    || status === 425
    || status === 429
    || (status >= 500 && status <= 599);
}

export function bloombergRetryDelayMs(
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

interface BloombergHtmlResponse {
  status: number;
  html: string | null;
}

async function fetchBloombergHtml(
  input: RequestInfo | URL,
  init: RequestInit,
  context: string
): Promise<BloombergHtmlResponse> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= UPSTREAM_ATTEMPTS; attempt += 1) {
    let response: Response;
    try {
      response = await fetchWithTimeout(input, init);
    } catch (error) {
      lastError = error;
      if (attempt === UPSTREAM_ATTEMPTS) throw error;
      await waitForRetry(bloombergRetryDelayMs(null, attempt));
      continue;
    }

    if (!response.ok) {
      const retryable = isTransientStatus(response.status);
      const delayMs = bloombergRetryDelayMs(
        response.headers.get("retry-after"),
        attempt
      );
      await cancelResponseBody(response);
      if (retryable && attempt < UPSTREAM_ATTEMPTS) {
        await waitForRetry(delayMs);
        continue;
      }
      return { status: response.status, html: null };
    }

    try {
      return {
        status: response.status,
        html: await readBoundedBloombergHtml(response, context),
      };
    } catch (error) {
      lastError = error;
      const retryable = error instanceof BloombergBodyTimeoutError
        || error instanceof TypeError;
      if (!retryable || attempt === UPSTREAM_ATTEMPTS) throw error;
      await waitForRetry(bloombergRetryDelayMs(null, attempt));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

function strictBloombergUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value, BLOOMBERG_ORIGIN);
  } catch {
    throw new Error("Bloomberg Careers returned an invalid job URL");
  }
  if (
    url.protocol !== "https:"
    || url.hostname !== "bloomberg.avature.net"
    || url.port
    || url.username
    || url.password
  ) {
    throw new Error("Bloomberg job URL must use HTTPS bloomberg.avature.net");
  }
  return url;
}

function parseJobUrl(value: string) {
  const url = strictBloombergUrl(decodeHtml(value));
  const match = url.pathname.match(/^\/careers\/JobDetail\/[^/]+\/(\d+)\/?$/);
  if (!match) throw new Error("Bloomberg job URL does not match the careers portal");
  url.search = "";
  url.hash = "";
  return { externalId: match[1], url: url.toString() };
}

export function normalizeBloombergSource(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error("Bloomberg source is required");
  if (trimmed.toLowerCase() === BLOOMBERG_SOURCE) return BLOOMBERG_SOURCE;

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error('Bloomberg source must be "bloomberg" or its official careers URL');
  }
  if (
    url.protocol !== "https:"
    || url.hostname !== "bloomberg.avature.net"
    || url.port
    || url.username
    || url.password
    || !/^\/careers(?:\/|$)/.test(url.pathname)
  ) {
    throw new Error("Bloomberg source URL must use HTTPS bloomberg.avature.net/careers");
  }
  return BLOOMBERG_SOURCE;
}

function searchUrl(offset: number) {
  const url = new URL("/careers/SearchJobs/", BLOOMBERG_ORIGIN);
  // Bloomberg's Avature tenant currently fixes the rendered page size at 12,
  // even when a larger value is requested. Pinning the observed value lets us
  // validate every page instead of trusting the pagination links blindly.
  url.searchParams.set("jobRecordsPerPage", String(PAGE_SIZE));
  url.searchParams.set("jobOffset", String(offset));
  return url;
}

interface BloombergPage {
  total: number;
  jobs: JobListing[];
}

function parseTotal(html: string) {
  const match = html.match(/aria-label\s*=\s*["']\s*([\d,]+)\s+results?\s*["']/i);
  if (!match) throw new Error("Bloomberg Careers returned a page without a result count");
  const total = Number(match[1].replace(/,/g, ""));
  if (!Number.isSafeInteger(total) || total < 0) {
    throw new Error("Bloomberg Careers returned an invalid result count");
  }
  return total;
}

function parseListing(article: string): JobListing {
  const anchors = article.match(/<a\b[^>]*>/gi) ?? [];
  const detailAnchor = anchors.find((tag) =>
    (attribute(tag, "href") ?? "").includes("/careers/JobDetail/")
  );
  if (!detailAnchor) throw new Error("Bloomberg Careers returned a result without a detail URL");
  const rawHref = attribute(detailAnchor, "href");
  if (!rawHref) throw new Error("Bloomberg Careers returned a result without a detail URL");
  const { externalId, url } = parseJobUrl(rawHref);

  const anchorStart = article.indexOf(detailAnchor) + detailAnchor.length;
  const anchorEnd = article.indexOf("</a>", anchorStart);
  if (anchorEnd < 0) throw new Error(`Bloomberg job ${externalId} is missing its title`);
  const title = htmlText(article.slice(anchorStart, anchorEnd));
  if (!title) throw new Error(`Bloomberg job ${externalId} is missing its title`);

  const locations = elementsByClass(article, "span", "list-item-location");
  const location = locations.length === 1 ? htmlText(locations[0]) : "";
  if (!location) throw new Error(`Bloomberg job ${externalId} is missing its location`);

  return {
    externalId,
    title,
    url,
    location,
    department: null,
    postedAt: null,
    description: null,
    salary: null,
  };
}

function parsePage(html: string, offset: number): BloombergPage {
  const total = parseTotal(html);
  const articles = elementsByClass(html, "article", "article--result");
  const expected = Math.min(PAGE_SIZE, Math.max(0, total - offset));
  if (articles.length !== expected) {
    throw new BloombergSnapshotConsistencyError(
      `Bloomberg Careers offset ${offset} returned ${articles.length} of ${expected} expected jobs`
    );
  }
  const jobs = articles.map(parseListing);
  const pageIds = new Set<string>();
  for (const job of jobs) {
    if (pageIds.has(job.externalId)) {
      throw new BloombergSnapshotConsistencyError(
        `Bloomberg Careers returned duplicate public ID ${job.externalId} within offset ${offset}`
      );
    }
    pageIds.add(job.externalId);
  }
  return { total, jobs };
}

async function fetchPage(offset: number) {
  // The default board order moves when a requisition is edited and can shift a
  // job between offsets while a poll is in flight. Bloomberg exposes Job Title
  // as a portal sort; submit it on every independent page request so concurrent
  // fetches do not depend on an Avature browser session or cookie jar.
  const body = new URLSearchParams({
    jobSort: TITLE_SORT_FIELD,
    jobSortDirection: "ASC",
  });
  const response = await fetchBloombergHtml(searchUrl(offset), {
    method: "POST",
    headers: {
      accept: "text/html",
      "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
    },
    body,
  }, `search offset ${offset}`);
  if (response.html === null) throw new Error(`Bloomberg Careers ${response.status}`);
  return parsePage(response.html, offset);
}

function addUniqueJobs(
  unique: Map<string, JobListing>,
  jobs: JobListing[]
) {
  for (const job of jobs) {
    if (!unique.has(job.externalId)) unique.set(job.externalId, job);
  }
}

async function fetchBloombergOnce() {
  const first = await fetchPage(0);
  if (first.total > MAX_RESULTS) {
    throw new Error(`Bloomberg Careers exceeded the ${MAX_RESULTS}-job safety cap`);
  }

  const unique = new Map<string, JobListing>();
  addUniqueJobs(unique, first.jobs);
  const offsets: number[] = [];
  for (let offset = PAGE_SIZE; offset < first.total; offset += PAGE_SIZE) {
    offsets.push(offset);
  }
  const pageWindows = [{ offset: 0, page: first }];

  for (let index = 0; index < offsets.length; index += PAGE_CONCURRENCY) {
    const batchOffsets = offsets.slice(index, index + PAGE_CONCURRENCY);
    const pages = await Promise.all(batchOffsets.map(fetchPage));
    for (let pageIndex = 0; pageIndex < pages.length; pageIndex += 1) {
      const page = pages[pageIndex];
      if (page.total !== first.total) {
        throw new BloombergSnapshotConsistencyError(
          `Bloomberg Careers result count changed during pagination (${first.total} to ${page.total})`
        );
      }
      addUniqueJobs(unique, page.jobs);
      pageWindows.push({ offset: batchOffsets[pageIndex], page });
    }
  }

  if (unique.size === first.total) return [...unique.values()];

  // Job Title is the most stable public sort Bloomberg exposes, but distinct
  // requisitions can share an identical title and Avature provides no public
  // secondary sort. Only a tie that crosses a page boundary can reorder IDs
  // between independent requests. If the base sweep is missing IDs, refetch a
  // 12-row window centered around each observed tied boundary instead of
  // overlapping all 32+ pages. Final unique-ID equality still fails closed if
  // a live mutation or an unusually large tie group prevents completeness.
  const recoveryOffsets = new Set<number>();
  for (let index = 1; index < pageWindows.length; index += 1) {
    const previous = pageWindows[index - 1];
    const current = pageWindows[index];
    const previousLast = previous.page.jobs.at(-1);
    const currentFirst = current.page.jobs[0];
    if (previousLast && currentFirst && previousLast.title === currentFirst.title) {
      recoveryOffsets.add(Math.max(0, current.offset - Math.floor(PAGE_SIZE / 2)));
    }
  }

  const recovery = [...recoveryOffsets];
  for (let index = 0; index < recovery.length; index += PAGE_CONCURRENCY) {
    const batchOffsets = recovery.slice(index, index + PAGE_CONCURRENCY);
    const pages = await Promise.all(batchOffsets.map(fetchPage));
    for (const page of pages) {
      if (page.total !== first.total) {
        throw new BloombergSnapshotConsistencyError(
          `Bloomberg Careers result count changed during pagination (${first.total} to ${page.total})`
        );
      }
      addUniqueJobs(unique, page.jobs);
    }
  }

  if (unique.size !== first.total) {
    throw new BloombergSnapshotConsistencyError(
      `Bloomberg Careers returned ${unique.size} of ${first.total} expected jobs`
    );
  }
  return [...unique.values()];
}

async function fetchStableBloombergSnapshot() {
  let lastError: BloombergSnapshotConsistencyError | null = null;
  for (let attempt = 1; attempt <= SNAPSHOT_ATTEMPTS; attempt += 1) {
    try {
      return await fetchBloombergOnce();
    } catch (error) {
      if (!(error instanceof BloombergSnapshotConsistencyError)) throw error;
      lastError = error;
    }
  }
  throw new Error(
    `Bloomberg Careers snapshot did not stabilize after ${SNAPSHOT_ATTEMPTS} attempts: ${lastError?.message ?? "unknown consistency error"}`
  );
}

function canonicalDetailUrl(html: string) {
  const links = html.match(/<link\b[^>]*>/gi) ?? [];
  const canonical = links.find((tag) =>
    (attribute(tag, "rel") ?? "").toLowerCase() === "canonical"
  );
  const href = canonical ? attribute(canonical, "href") : null;
  if (!href) throw new Error("Bloomberg job detail is missing its canonical URL");
  return parseJobUrl(href);
}

function parseJobContent(html: string, externalId: string): JobContent {
  const canonical = canonicalDetailUrl(html);
  if (canonical.externalId !== externalId) {
    throw new Error(
      `Bloomberg job detail returned public ID ${canonical.externalId} for ${externalId}`
    );
  }

  const details = elementsByClass(html, "article", "article--details");
  const descriptionArticle = details.find((article) => {
    const headings = article.match(/<h2\b[^>]*>[\s\S]*?<\/h2>/gi) ?? [];
    return headings.some((heading) => htmlText(heading) === "Description & Requirements");
  });
  if (!descriptionArticle) {
    throw new Error(`Bloomberg job ${externalId} is missing its description section`);
  }

  const values = elementsByClass(
    descriptionArticle,
    "div",
    "article__content__view__field__value"
  ).map((value) => value.trim()).filter((value) => htmlText(value));
  const description = values.join("\n") || null;
  if (!description) throw new Error(`Bloomberg job ${externalId} has an empty description`);
  return {
    description,
    salary: extractSalaryFromHtml(description),
  };
}

export class BloombergAdapter implements ATSAdapter {
  readonly name = "bloomberg";

  async fetchJobs(value: string): Promise<JobListing[]> {
    normalizeBloombergSource(value);
    return fetchStableBloombergSnapshot();
  }

  async fetchJobContent(
    value: string,
    externalId: string,
    jobUrl?: string
  ): Promise<JobContent> {
    normalizeBloombergSource(value);
    if (!/^\d+$/.test(externalId)) {
      throw new Error("Bloomberg public job ID must be numeric");
    }

    let url: URL;
    if (jobUrl) {
      const parsed = parseJobUrl(jobUrl);
      if (parsed.externalId !== externalId) {
        throw new Error("Bloomberg job URL does not match its public ID");
      }
      url = new URL(parsed.url);
    } else {
      url = new URL("/careers/JobDetail", BLOOMBERG_ORIGIN);
      url.searchParams.set("jobId", externalId);
    }

    const response = await fetchBloombergHtml(url, {
      headers: { accept: "text/html" },
    }, `job ${externalId}`);
    if (response.html === null) {
      if (response.status === 404 || response.status === 410) {
        return { description: null, salary: null };
      }
      throw new Error(`Bloomberg Careers ${response.status} for job ${externalId}`);
    }
    return parseJobContent(response.html, externalId);
  }
}
