import type { ATSAdapter, JobContent, JobListing } from "./types";
import { parseNextData } from "./embedded-json";
import { extractSalaryFromHtml } from "./salary";
import { fetchWithTimeout } from "../http";

const PAGE_SIZE = 1000;
const PAGE_CONCURRENCY = 3;

interface RipplingLocation {
  name?: string;
  country?: string;
  countryCode?: string;
  workplaceType?: "REMOTE" | "HYBRID" | "ON_SITE" | string;
}

interface RipplingPosting {
  id: string;
  name: string;
  url?: string;
  department?: { name?: string | null } | null;
  locations?: RipplingLocation[];
}

interface RipplingPage {
  items?: RipplingPosting[];
  page?: number;
  pageSize?: number;
  totalItems?: number;
  totalPages?: number;
}

interface RipplingDetail {
  uuid?: string;
  description?: Record<string, string | null | undefined>;
  workLocations?: string[];
  department?: { name?: string | null } | null;
  createdOn?: string | null;
  payRangeDetails?: unknown[];
}

interface RipplingNextData {
  props?: {
    pageProps?: {
      apiData?: {
        jobPost?: RipplingDetail;
      };
    };
  };
}

export function normalizeRipplingSource(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error("Rippling source is required");

  if (!trimmed.includes("://")) {
    if (!/^[a-z0-9][a-z0-9-]*$/i.test(trimmed)) {
      throw new Error("Rippling source must be a board slug or ats.rippling.com URL");
    }
    return trimmed;
  }

  const url = new URL(trimmed);
  if (url.hostname !== "ats.rippling.com") {
    throw new Error("Rippling source must use ats.rippling.com");
  }

  const parts = url.pathname.split("/").filter(Boolean);
  const jobsIndex = parts.indexOf("jobs");
  const slug = jobsIndex > 0 ? parts[jobsIndex - 1] : parts[0];
  if (!slug) throw new Error("Rippling source URL is missing its board slug");
  return slug;
}

function apiUrl(slug: string, page: number) {
  const url = new URL(
    `https://ats.us1.rippling.com/api/v2/board/${encodeURIComponent(slug)}/jobs`
  );
  url.searchParams.set("groupJobsByLocation", "false");
  url.searchParams.set("searchQuery", "");
  url.searchParams.set("country", "");
  url.searchParams.set("state", "");
  url.searchParams.set("city", "");
  url.searchParams.set("page", String(page));
  url.searchParams.set("pageSize", String(PAGE_SIZE));
  return url.toString();
}

async function fetchPage(slug: string, page: number): Promise<RipplingPage> {
  const response = await fetchWithTimeout(apiUrl(slug, page));
  if (!response.ok) throw new Error(`Rippling API ${response.status}`);

  const data = await response.json() as RipplingPage;
  if (
    !Array.isArray(data.items)
    || typeof data.totalItems !== "number"
    || typeof data.totalPages !== "number"
  ) {
    throw new Error(`Rippling API returned an unexpected payload for ${slug}`);
  }
  return data;
}

async function fetchAllPostings(slug: string) {
  const firstPage = await fetchPage(slug, 0);
  const pages = Array.from(
    { length: Math.max(0, (firstPage.totalPages ?? 1) - 1) },
    (_, index) => index + 1
  );
  const postings = [...(firstPage.items ?? [])];

  for (let index = 0; index < pages.length; index += PAGE_CONCURRENCY) {
    const batch = await Promise.all(
      pages.slice(index, index + PAGE_CONCURRENCY)
        .map((page) => fetchPage(slug, page))
    );
    for (const page of batch) postings.push(...(page.items ?? []));
  }

  if (postings.length !== firstPage.totalItems) {
    throw new Error(
      `Rippling returned ${postings.length} of ${firstPage.totalItems} expected jobs`
    );
  }
  return postings;
}

function formatLocations(locations: RipplingLocation[] | undefined) {
  const names = (locations ?? []).map((location) => {
    const name = location.name?.trim()
      || location.country?.trim()
      || location.countryCode?.trim()
      || "";
    if (location.workplaceType === "REMOTE" && !/\bremote\b/i.test(name)) {
      return name ? `Remote, ${name}` : "Remote";
    }
    if (location.workplaceType === "HYBRID" && !/\bhybrid\b/i.test(name)) {
      return name ? `Hybrid, ${name}` : "Hybrid";
    }
    return name;
  }).filter(Boolean);
  return [...new Set(names)].join(" / ") || "Unknown";
}

function detailDescription(detail: RipplingDetail | undefined) {
  if (!detail?.description) return null;
  const content = Object.values(detail.description)
    .filter((section): section is string => Boolean(section?.trim()));
  return content.join("\n") || null;
}

export class RipplingAdapter implements ATSAdapter {
  readonly name = "rippling";

  async fetchJobs(value: string): Promise<JobListing[]> {
    const slug = normalizeRipplingSource(value);
    return (await fetchAllPostings(slug)).map((posting) => ({
      externalId: posting.id,
      title: posting.name,
      url: posting.url || `https://ats.rippling.com/${slug}/jobs/${posting.id}`,
      location: formatLocations(posting.locations),
      department: posting.department?.name?.trim() || null,
      postedAt: null,
      description: null,
      salary: null,
    }));
  }

  async fetchJobContent(
    value: string,
    externalId: string,
    jobUrl?: string
  ): Promise<JobContent> {
    const slug = normalizeRipplingSource(value);
    const url = jobUrl || `https://ats.rippling.com/${slug}/jobs/${externalId}`;
    const parsedUrl = new URL(url);
    if (parsedUrl.hostname !== "ats.rippling.com") {
      throw new Error("Rippling job URL does not match its configured board");
    }
    const parts = parsedUrl.pathname.split("/").filter(Boolean);
    const jobsIndex = parts.indexOf("jobs");
    if (
      jobsIndex < 1
      || parts[jobsIndex - 1] !== slug
      || parts[jobsIndex + 1] !== externalId
    ) {
      throw new Error("Rippling job URL does not match its configured board");
    }

    const response = await fetchWithTimeout(url);
    if (!response.ok) return { description: null, salary: null };

    const data = parseNextData<RipplingNextData>(await response.text());
    const detail = data.props?.pageProps?.apiData?.jobPost;
    if (!detail) return { description: null, salary: null };

    const description = detailDescription(detail);
    return {
      description,
      salary: extractSalaryFromHtml(description),
      location: detail.workLocations?.join(" / ") || null,
      postedAt: detail.createdOn ?? null,
    };
  }
}
