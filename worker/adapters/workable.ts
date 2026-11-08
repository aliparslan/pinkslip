import type { ATSAdapter, JobContent, JobListing } from "./types";
import { extractSalaryFromHtml } from "./salary";
import { fetchWithTimeout } from "../http";

interface WorkableLocation {
  country?: string | null;
  city?: string | null;
  region?: string | null;
  hidden?: boolean | null;
}

interface WorkableJob {
  shortcode: string;
  title: string;
  url?: string | null;
  shortlink?: string | null;
  department?: string | null;
  published_on?: string | null;
  created_at?: string | null;
  telecommuting?: boolean | null;
  country?: string | null;
  city?: string | null;
  state?: string | null;
  description?: string | null;
  locations?: WorkableLocation[] | null;
}

export function normalizeWorkableSource(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error("Workable source is required");

  if (!trimmed.includes("://")) {
    if (!/^[a-z0-9][a-z0-9_-]*$/i.test(trimmed)) {
      throw new Error("Workable source must be an account slug or apply.workable.com URL");
    }
    return trimmed;
  }

  const url = new URL(trimmed);
  if (url.hostname !== "apply.workable.com") {
    throw new Error("Workable source must use apply.workable.com");
  }
  const slug = url.pathname.split("/").filter(Boolean)[0];
  if (!slug) throw new Error("Workable source URL is missing its account slug");
  return slug;
}

function boardUrl(slug: string) {
  return `https://apply.workable.com/api/v1/widget/accounts/${encodeURIComponent(slug)}?details=true`;
}

async function fetchBoard(slug: string): Promise<WorkableJob[]> {
  const response = await fetchWithTimeout(boardUrl(slug));
  if (!response.ok) throw new Error(`Workable API ${response.status}`);

  const data = await response.json() as { jobs?: unknown };
  if (!Array.isArray(data.jobs)) {
    throw new Error(`Workable API returned an unexpected payload for ${slug}`);
  }
  return data.jobs as WorkableJob[];
}

function place(parts: (string | null | undefined)[]) {
  return parts.map((part) => part?.trim()).filter(Boolean).join(", ");
}

function jobLocation(job: WorkableJob) {
  const places = (job.locations ?? [])
    .filter((location) => !location.hidden)
    .map((location) => place([location.city, location.region, location.country]))
    .filter(Boolean);
  const joined = [...new Set(places)].join(" / ")
    || place([job.city, job.state, job.country])
    || "Unknown";
  return job.telecommuting ? `Remote - ${joined}` : joined;
}

function mapJob(job: WorkableJob): JobListing {
  const description = job.description?.trim() || null;
  const published = job.published_on ?? job.created_at;
  const postedAt = published && !Number.isNaN(Date.parse(published))
    ? new Date(published).toISOString()
    : null;

  return {
    externalId: job.shortcode,
    title: job.title.trim(),
    url: job.url || job.shortlink || `https://apply.workable.com/j/${job.shortcode}`,
    location: jobLocation(job),
    department: job.department?.trim() || null,
    postedAt,
    description,
    salary: extractSalaryFromHtml(description),
  };
}

export class WorkableAdapter implements ATSAdapter {
  readonly name = "workable";

  async fetchJobs(value: string): Promise<JobListing[]> {
    const slug = normalizeWorkableSource(value);
    return (await fetchBoard(slug)).map(mapJob);
  }

  async fetchJobContent(value: string, externalId: string): Promise<JobContent> {
    const slug = normalizeWorkableSource(value);
    const job = (await fetchBoard(slug)).find((posting) => posting.shortcode === externalId);
    if (!job) return { description: null, salary: null };
    const listing = mapJob(job);
    return {
      description: listing.description,
      salary: listing.salary,
      location: listing.location,
      postedAt: listing.postedAt,
    };
  }
}
