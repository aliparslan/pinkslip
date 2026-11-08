import type { ATSAdapter, JobContent, JobListing } from "./types";
import { decodeHtmlEntities } from "./embedded-json";
import { extractSalaryFromHtml } from "./salary";
import { fetchWithTimeout } from "../http";

// Avature boards have no public API. The listing pages are server-rendered,
// ten results at a time, and `jobOffset` walks them. Two Sigma's board is about
// seven pages.
const PAGE_SIZE = 10;
const MAX_PAGES = 60;

const RESULT_PATTERN = /<article\b[^>]*\barticle--result\b[^>]*>([\s\S]*?)<\/article>/gi;
const TITLE_LINK_PATTERN = /<a\b[^>]*\bhref="([^"]*\/JobDetail\/[^"]*\/(\d+))"[^>]*>([\s\S]*?)<\/a>/i;
const FIELD_PATTERN = /<span\b[^>]*\bparagraph_inner-span\b[^>]*>([\s\S]*?)<\/span>/gi;
const SECTION_PATTERN = /<section\b[^>]*>([\s\S]*?)<\/section>/gi;

/** A board is the HTTPS URL of its listing page: origin plus /careers/<Page>. */
export function normalizeAvatureSource(value: string): string {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error("Avature source must be the full URL of the board's listing page");
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port) {
    throw new Error("Avature source must be a plain HTTPS URL");
  }
  const path = url.pathname.replace(/\/+$/, "");
  if (!/^\/[a-z]+\/[a-z0-9_-]+$/i.test(path)) {
    throw new Error("Avature source must point at a listing page such as /careers/OpenRoles");
  }
  return `${url.origin}${path}`;
}

function text(html: string) {
  return decodeHtmlEntities(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

/** "United States - NY New York" reads as "New York, NY, United States". */
function cleanLocation(raw: string) {
  const separator = raw.indexOf(" - ");
  if (separator === -1) return raw;
  const country = raw.slice(0, separator).trim();
  const rest = raw.slice(separator + 3).trim();
  const region = rest.match(/^([A-Z]{2}) (.+)$/);
  if (!region) return `${rest}, ${country}`;
  return country.startsWith("United States")
    ? `${region[2]}, ${region[1]}, ${country}`
    : `${region[2]}, ${country}`;
}

export function parseAvatureListings(html: string): JobListing[] {
  const listings: JobListing[] = [];
  for (const [, block] of html.matchAll(RESULT_PATTERN)) {
    const link = block!.match(TITLE_LINK_PATTERN);
    if (!link) continue;
    const fields = [...block!.matchAll(FIELD_PATTERN)].map(([, field]) => text(field!));
    listings.push({
      externalId: link[2]!,
      title: text(link[3]!),
      url: decodeHtmlEntities(link[1]!),
      location: fields[0] ? cleanLocation(fields[0]) : "Unknown",
      department: fields[1] || null,
      postedAt: null,
      description: null,
      salary: null,
    });
  }
  return listings;
}

/** The description is the section with the most text on the detail page. */
export function parseAvatureDescription(html: string): string | null {
  let best: string | null = null;
  let bestLength = 0;
  for (const [, section] of html.matchAll(SECTION_PATTERN)) {
    const length = text(section!).length;
    if (length > bestLength) {
      best = section!;
      bestLength = length;
    }
  }
  return best?.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, "").trim() || null;
}

async function fetchPage(url: string): Promise<string> {
  const response = await fetchWithTimeout(url);
  if (!response.ok) throw new Error(`Avature page ${response.status}`);
  return response.text();
}

export class AvatureAdapter implements ATSAdapter {
  readonly name = "avature";

  async fetchJobs(value: string): Promise<JobListing[]> {
    const board = normalizeAvatureSource(value);
    const jobs = new Map<string, JobListing>();

    for (let page = 0; page < MAX_PAGES; page += 1) {
      const url = page === 0 ? board : `${board}?jobOffset=${page * PAGE_SIZE}`;
      const listings = parseAvatureListings(await fetchPage(url));
      const before = jobs.size;
      for (const listing of listings) jobs.set(listing.externalId, listing);
      // Past the last page Avature repeats results or returns none.
      if (jobs.size === before) break;
    }

    // Any healthy board has results, so this is a redesign, not an empty board.
    if (jobs.size === 0) throw new Error("Avature board returned no readable results");
    return [...jobs.values()];
  }

  async fetchJobContent(value: string, externalId: string, jobUrl?: string): Promise<JobContent> {
    const board = normalizeAvatureSource(value);
    const url = jobUrl ?? `${board.replace(/\/[^/]+$/, "")}/JobDetail/job/${encodeURIComponent(externalId)}`;
    const description = parseAvatureDescription(await fetchPage(url));
    return { description, salary: extractSalaryFromHtml(description) };
  }
}
