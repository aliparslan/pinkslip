import type { ATSAdapter, JobContent, JobListing } from "./types";
import { extractSalaryFromHtml } from "./salary";
import { fetchWithTimeout } from "../http";

const PAGE_SIZE = 100;
const PAGE_CONCURRENCY = 4;

interface SmartRecruitersLocation {
  city?: string;
  region?: string;
  country?: string;
  remote?: boolean;
  hybrid?: boolean;
  fullLocation?: string;
}

interface SmartRecruitersPosting {
  id: string;
  name: string;
  releasedDate?: string | null;
  location?: SmartRecruitersLocation | null;
  department?: { label?: string | null } | null;
}

interface SmartRecruitersPage {
  offset?: number;
  limit?: number;
  totalFound?: number;
  content?: SmartRecruitersPosting[];
}

interface SmartRecruitersSection {
  text?: string | null;
}

interface SmartRecruitersDetail extends SmartRecruitersPosting {
  postingUrl?: string | null;
  jobAd?: {
    sections?: Record<string, SmartRecruitersSection | undefined>;
  } | null;
}

export function normalizeSmartRecruitersSource(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error("SmartRecruiters source is required");

  if (!trimmed.includes("://")) {
    if (!/^[a-z0-9][a-z0-9_-]*$/i.test(trimmed)) {
      throw new Error("SmartRecruiters source must be a company identifier or URL");
    }
    return trimmed;
  }

  const url = new URL(trimmed);
  if (!["jobs.smartrecruiters.com", "api.smartrecruiters.com"].includes(url.hostname)) {
    throw new Error("SmartRecruiters source must use smartrecruiters.com");
  }

  const parts = url.pathname.split("/").filter(Boolean);
  const identifier = url.hostname === "api.smartrecruiters.com"
    ? parts[2]
    : parts[0];
  if (!identifier) {
    throw new Error("SmartRecruiters source URL is missing its company identifier");
  }
  return identifier;
}

function apiUrl(identifier: string, suffix = "") {
  return `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(identifier)}/postings${suffix}`;
}

function postingUrl(identifier: string, posting: SmartRecruitersPosting) {
  const titleSlug = posting.name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-");
  return `https://jobs.smartrecruiters.com/${identifier}/${posting.id}-${titleSlug}`;
}

function formatLocation(location: SmartRecruitersLocation | null | undefined) {
  const base = location?.fullLocation?.trim()
    || [location?.city, location?.region, location?.country]
      .filter(Boolean)
      .join(", ");
  const workMode = location?.remote ? "Remote" : location?.hybrid ? "Hybrid" : "";
  if (workMode && !base.toLowerCase().includes(workMode.toLowerCase())) {
    return base ? `${workMode}, ${base}` : workMode;
  }
  return base || workMode || "Unknown";
}

async function fetchPage(identifier: string, offset: number): Promise<SmartRecruitersPage> {
  const url = new URL(apiUrl(identifier));
  url.searchParams.set("limit", String(PAGE_SIZE));
  url.searchParams.set("offset", String(offset));
  url.searchParams.set("country", "us");

  const response = await fetchWithTimeout(url.toString());
  if (!response.ok) throw new Error(`SmartRecruiters API ${response.status}`);

  const data = await response.json() as SmartRecruitersPage;
  if (!Array.isArray(data.content) || typeof data.totalFound !== "number") {
    throw new Error(`SmartRecruiters API returned an unexpected payload for ${identifier}`);
  }
  return data;
}

async function fetchAllPostings(identifier: string) {
  const firstPage = await fetchPage(identifier, 0);
  const total = firstPage.totalFound ?? 0;
  const offsets: number[] = [];
  for (let offset = PAGE_SIZE; offset < total; offset += PAGE_SIZE) offsets.push(offset);

  const postings = [...(firstPage.content ?? [])];
  for (let index = 0; index < offsets.length; index += PAGE_CONCURRENCY) {
    const pages = await Promise.all(
      offsets.slice(index, index + PAGE_CONCURRENCY)
        .map((offset) => fetchPage(identifier, offset))
    );
    for (const page of pages) postings.push(...(page.content ?? []));
  }

  if (postings.length !== total) {
    throw new Error(`SmartRecruiters returned ${postings.length} of ${total} expected US jobs`);
  }
  return postings;
}

function detailDescription(detail: SmartRecruitersDetail) {
  const sections = detail.jobAd?.sections ?? {};
  const content = [
    sections.companyDescription?.text,
    sections.jobDescription?.text,
    sections.qualifications?.text,
    sections.additionalInformation?.text,
  ].filter((section): section is string => Boolean(section?.trim()));
  return content.join("\n") || null;
}

export class SmartRecruitersAdapter implements ATSAdapter {
  readonly name = "smartrecruiters";

  async fetchJobs(value: string): Promise<JobListing[]> {
    const identifier = normalizeSmartRecruitersSource(value);
    return (await fetchAllPostings(identifier)).map((posting) => ({
      externalId: posting.id,
      title: posting.name,
      url: postingUrl(identifier, posting),
      location: formatLocation(posting.location),
      department: posting.department?.label?.trim() || null,
      postedAt: posting.releasedDate ?? null,
      description: null,
      salary: null,
    }));
  }

  async fetchJobContent(
    value: string,
    externalId: string
  ): Promise<JobContent> {
    const identifier = normalizeSmartRecruitersSource(value);
    const response = await fetchWithTimeout(apiUrl(identifier, `/${encodeURIComponent(externalId)}`));
    if (!response.ok) return { description: null, salary: null };

    const detail = await response.json() as SmartRecruitersDetail;
    const description = detailDescription(detail);
    return {
      description,
      salary: extractSalaryFromHtml(description),
      location: formatLocation(detail.location),
      postedAt: detail.releasedDate ?? null,
    };
  }
}
