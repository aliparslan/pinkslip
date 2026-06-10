import type { ATSAdapter, JobContent, JobListing } from "./types";
import { extractSalaryFromHtml } from "./salary";
import { isUsJobLocation } from "../us-jobs";
import { fetchWithTimeout } from "../http";

const PAGE_SIZE = 20;
const PAGE_CONCURRENCY = 6;
const WORKDAY_RESULT_CAP = 2000;

interface WorkdaySource {
  origin: string;
  tenant: string;
  site: string;
  locale: string | null;
  country: "US";
  boardUrl: string;
}

interface WorkdayPosting {
  title: string;
  externalPath: string;
  locationsText?: string;
  postedOn?: string;
  bulletFields?: string[];
}

interface WorkdayFacetValue {
  descriptor?: string;
  id?: string;
  count?: number;
  facetParameter?: string;
  values?: WorkdayFacetValue[];
}

interface WorkdayJobsResponse {
  total?: number;
  jobPostings?: WorkdayPosting[];
  facets?: WorkdayFacetValue[];
}

interface WorkdayJobDetail {
  jobPostingInfo?: {
    title?: string;
    jobDescription?: string;
    location?: string;
    additionalLocations?: string[];
    startDate?: string;
    jobReqId?: string;
    externalUrl?: string;
  };
}

function localeSegment(value: string) {
  return /^[a-z]{2}-[A-Z]{2}$/.test(value);
}

export function parseWorkdaySource(value: string): WorkdaySource {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error("Workday source must be a full myworkdayjobs.com board URL");
  }

  if (url.protocol !== "https:" || !url.hostname.endsWith(".myworkdayjobs.com")) {
    throw new Error("Workday source must use an HTTPS myworkdayjobs.com URL");
  }

  const tenant = url.hostname.split(".")[0]?.trim();
  const parts = url.pathname.split("/").filter(Boolean);
  const locale = parts[0] && localeSegment(parts[0]) ? parts.shift()! : null;
  const site = parts.shift()?.trim();

  if (!tenant || !site) {
    throw new Error("Workday source URL must include its public career-site name");
  }

  const country = "US";
  const boardPath = `/${locale ? `${locale}/` : ""}${site}`;
  const boardUrl = `${url.origin}${boardPath}?country=US`;

  return {
    origin: url.origin,
    tenant,
    site,
    locale,
    country,
    boardUrl,
  };
}

export function normalizeWorkdaySource(value: string) {
  return parseWorkdaySource(value).boardUrl;
}

function postedAtFromLabel(label: string | undefined, now = new Date()) {
  if (!label) return null;
  const normalized = label.trim().toLowerCase();
  const result = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate()
  ));

  if (normalized === "posted today") return result.toISOString();
  if (normalized === "posted yesterday") {
    result.setUTCDate(result.getUTCDate() - 1);
    return result.toISOString();
  }

  const match = normalized.match(/^posted (\d+) days? ago$/);
  if (!match) return null;
  result.setUTCDate(result.getUTCDate() - Number(match[1]));
  return result.toISOString();
}

function collectFacets(nodes: WorkdayFacetValue[] | undefined, output: WorkdayFacetValue[] = []) {
  for (const node of nodes ?? []) {
    if (node.facetParameter && Array.isArray(node.values)) output.push(node);
    collectFacets(node.values, output);
  }
  return output;
}

function normalizeCountry(value: string) {
  const normalized = value.trim().toLowerCase();
  if (["us", "usa", "united states", "united states of america"].includes(normalized)) {
    return "united states";
  }
  return normalized;
}

function usFacet(response: WorkdayJobsResponse) {
  const requested = normalizeCountry("US");
  const facets = collectFacets(response.facets);
  const candidates = facets.filter((facet) => {
    const key = `${facet.facetParameter ?? ""} ${facet.descriptor ?? ""}`.toLowerCase();
    return key.includes("country");
  });

  for (const facet of candidates) {
    const match = facet.values?.find((value) => {
      const descriptor = normalizeCountry(value.descriptor ?? "");
      return descriptor === requested
        || (requested === "united states" && descriptor.startsWith("united states"));
    });
    if (match?.id && facet.facetParameter) {
      return { parameter: facet.facetParameter, ids: [match.id] };
    }
  }

  for (const facet of facets) {
    const key = `${facet.facetParameter ?? ""} ${facet.descriptor ?? ""}`.toLowerCase();
    if (!key.includes("location") || key.includes("country")) continue;
    const ids = (facet.values ?? [])
      .filter((value) => value.id && isUsJobLocation(value.descriptor ?? ""))
      .map((value) => value.id!);
    if (facet.facetParameter && ids.length > 0) {
      return { parameter: facet.facetParameter, ids };
    }
  }

  throw new Error("Workday board does not expose a United States country or location facet");
}

function workdayApiUrl(source: WorkdaySource, suffix: string) {
  return `${source.origin}/wday/cxs/${encodeURIComponent(source.tenant)}/${encodeURIComponent(source.site)}${suffix}`;
}

async function fetchPage(
  source: WorkdaySource,
  offset: number,
  appliedFacets: Record<string, string[]>
): Promise<WorkdayJobsResponse> {
  const response = await fetchWithTimeout(workdayApiUrl(source, "/jobs"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      appliedFacets,
      limit: PAGE_SIZE,
      offset,
      searchText: "",
    }),
  });

  if (!response.ok) {
    throw new Error(`Workday API ${response.status}`);
  }

  const data = await response.json() as WorkdayJobsResponse;
  if (!Array.isArray(data.jobPostings) || typeof data.total !== "number") {
    throw new Error(`Workday API returned an unexpected payload for ${source.boardUrl}`);
  }
  return data;
}

async function fetchRemainingPages(
  source: WorkdaySource,
  total: number,
  appliedFacets: Record<string, string[]>
) {
  const offsets: number[] = [];
  for (let offset = PAGE_SIZE; offset < total; offset += PAGE_SIZE) offsets.push(offset);

  const postings: WorkdayPosting[] = [];
  for (let index = 0; index < offsets.length; index += PAGE_CONCURRENCY) {
    const batch = await Promise.all(
      offsets.slice(index, index + PAGE_CONCURRENCY)
        .map((offset) => fetchPage(source, offset, appliedFacets))
    );
    for (const page of batch) postings.push(...(page.jobPostings ?? []));
  }
  return postings;
}

function mapPosting(source: WorkdaySource, posting: WorkdayPosting): JobListing {
  const externalId = posting.bulletFields?.find((field) => field.trim()) ?? posting.externalPath;
  const rawLocation = posting.locationsText?.trim() || "";
  return {
    externalId,
    title: posting.title,
    url: `${source.origin}/${source.site}${posting.externalPath}`,
    location: isUsJobLocation(rawLocation)
      ? rawLocation
      : rawLocation
        ? `${rawLocation}, United States`
        : "United States",
    department: null,
    postedAt: postedAtFromLabel(posting.postedOn),
    description: null,
    salary: null,
  };
}

function detailPath(source: WorkdaySource, jobUrl: string | undefined, externalId: string) {
  if (!jobUrl) {
    if (externalId.startsWith("/job/")) return externalId;
    throw new Error("Workday job detail requires its public job URL");
  }

  const url = new URL(jobUrl);
  if (url.origin !== source.origin) {
    throw new Error("Workday job URL does not match its configured board");
  }

  const parts = url.pathname.split("/").filter(Boolean);
  const siteIndex = parts.indexOf(source.site);
  if (siteIndex < 0) throw new Error("Workday job URL is missing its career-site name");
  const path = `/${parts.slice(siteIndex + 1).join("/")}`;
  if (!path.startsWith("/job/")) throw new Error("Workday job URL is missing its job path");
  return path;
}

function startDateToIso(value: string | undefined) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  return `${value}T00:00:00.000Z`;
}

export class WorkdayAdapter implements ATSAdapter {
  readonly name = "workday";

  async fetchJobs(slug: string): Promise<JobListing[]> {
    const source = parseWorkdaySource(slug);
    let appliedFacets: Record<string, string[]> = {};
    let firstPage = await fetchPage(source, 0, appliedFacets);

    const facet = usFacet(firstPage);
    appliedFacets = { [facet.parameter]: facet.ids };
    firstPage = await fetchPage(source, 0, appliedFacets);

    const total = firstPage.total ?? 0;
    if (total >= WORKDAY_RESULT_CAP) {
      throw new Error(
        `Workday board reached its ${WORKDAY_RESULT_CAP}-job United States result cap`
      );
    }

    const postings = [
      ...(firstPage.jobPostings ?? []),
      ...await fetchRemainingPages(source, total, appliedFacets),
    ];

    if (postings.length !== total) {
      throw new Error(`Workday returned ${postings.length} of ${total} expected jobs`);
    }

    const unique = new Map<string, JobListing>();
    for (const posting of postings) {
      const listing = mapPosting(source, posting);
      unique.set(listing.externalId, listing);
    }
    return [...unique.values()];
  }

  async fetchJobContent(
    slug: string,
    externalId: string,
    jobUrl?: string
  ): Promise<JobContent> {
    const source = parseWorkdaySource(slug);
    const path = detailPath(source, jobUrl, externalId);
    const response = await fetchWithTimeout(workdayApiUrl(source, path));
    if (!response.ok) return { description: null, salary: null };

    const data = await response.json() as WorkdayJobDetail;
    const detail = data.jobPostingInfo;
    if (!detail) return { description: null, salary: null };

    const locations = [detail.location, ...(detail.additionalLocations ?? [])]
      .filter((location): location is string => Boolean(location?.trim()));
    const description = detail.jobDescription?.trim() || null;
    return {
      description,
      salary: extractSalaryFromHtml(description),
      location: [...new Set(locations)].join(" / ") || null,
      postedAt: startDateToIso(detail.startDate),
    };
  }
}
