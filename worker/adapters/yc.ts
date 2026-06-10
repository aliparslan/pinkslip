import type { ATSAdapter, JobContent, JobListing } from "./types";
import { parseDataPage } from "./embedded-json";
import { extractSalaryFromHtml } from "./salary";
import { fetchWithTimeout } from "../http";

const YC_ORIGIN = "https://www.ycombinator.com";

interface YcJob {
  id: number;
  title: string;
  url: string;
  location?: string | null;
  prettyRole?: string | null;
  roleSpecificType?: string | null;
  salaryRange?: string | null;
  createdAt?: string | null;
  description?: string | null;
}

interface YcDataPage {
  props?: {
    jobPostings?: YcJob[];
    job?: YcJob;
  };
}

interface YcStructuredJob {
  "@type"?: string;
  description?: string | null;
  datePosted?: string | null;
}

export function normalizeYcSource(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error("YC source is required");

  if (!trimmed.includes("://")) {
    if (!/^[a-z0-9][a-z0-9-]*$/i.test(trimmed)) {
      throw new Error("YC source must be a company slug or ycombinator.com URL");
    }
    return trimmed;
  }

  const url = new URL(trimmed);
  if (!["ycombinator.com", "www.ycombinator.com"].includes(url.hostname)) {
    throw new Error("YC source must use ycombinator.com");
  }

  const parts = url.pathname.split("/").filter(Boolean);
  const companyIndex = parts.indexOf("companies");
  const slug = companyIndex >= 0 ? parts[companyIndex + 1] : null;
  if (!slug) throw new Error("YC source URL is missing its company slug");
  return slug;
}

function companyJobsUrl(slug: string) {
  return `${YC_ORIGIN}/companies/${encodeURIComponent(slug)}/jobs`;
}

async function fetchHtml(url: string): Promise<string> {
  const response = await fetchWithTimeout(url);
  if (!response.ok) throw new Error(`YC jobs page ${response.status}`);
  return response.text();
}

function parseStructuredJob(html: string): YcStructuredJob | null {
  const scripts = html.matchAll(
    /<script[^>]*\btype=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  );
  for (const match of scripts) {
    const data = JSON.parse(match[1]) as YcStructuredJob;
    if (data["@type"] === "JobPosting") return data;
  }
  return null;
}

function mapJob(job: YcJob): JobListing {
  const description = job.description?.trim() || null;
  return {
    externalId: String(job.id),
    title: job.title,
    url: new URL(job.url, YC_ORIGIN).toString(),
    location: job.location?.trim() || "Unknown",
    department: job.prettyRole?.trim() || job.roleSpecificType?.trim() || null,
    postedAt: null,
    description,
    salary: job.salaryRange?.trim() || extractSalaryFromHtml(description),
  };
}

export class YcAdapter implements ATSAdapter {
  readonly name = "yc";

  async fetchJobs(value: string): Promise<JobListing[]> {
    const slug = normalizeYcSource(value);
    const data = parseDataPage<YcDataPage>(await fetchHtml(companyJobsUrl(slug)));
    if (!Array.isArray(data.props?.jobPostings)) {
      throw new Error(`YC returned an unexpected jobs payload for ${slug}`);
    }
    return data.props.jobPostings.map(mapJob);
  }

  async fetchJobContent(
    value: string,
    externalId: string,
    jobUrl?: string
  ): Promise<JobContent> {
    const slug = normalizeYcSource(value);
    if (!jobUrl) throw new Error("YC job detail requires its public job URL");

    const url = new URL(jobUrl);
    if (!["ycombinator.com", "www.ycombinator.com"].includes(url.hostname)) {
      throw new Error("YC job URL does not use ycombinator.com");
    }
    const parts = url.pathname.split("/").filter(Boolean);
    if (
      parts[0] !== "companies"
      || parts[1] !== slug
      || parts[2] !== "jobs"
      || !parts[3]
    ) {
      throw new Error("YC job URL does not match its configured company");
    }

    const html = await fetchHtml(url.toString());
    const data = parseDataPage<YcDataPage>(html);
    const job = data.props?.job;
    if (!job || String(job.id) !== externalId) {
      return { description: null, salary: null };
    }
    const listing = mapJob(job);
    const structured = parseStructuredJob(html);
    const description = structured?.description?.trim() || listing.description;
    return {
      description,
      salary: listing.salary || extractSalaryFromHtml(description),
      location: listing.location,
      postedAt: structured?.datePosted ?? null,
    };
  }
}
