import type { ATSAdapter, JobContent, JobListing } from "./types";
import { extractSalaryFromHtml } from "./salary";
import { fetchWithTimeout } from "../http";

interface GemJob {
  id: number;
  title: string;
  absolute_url: string;
  content?: string | null;
  content_plain?: string | null;
  first_published_at?: string | null;
  departments?: { name?: string | null }[];
  location?: { name?: string | null } | null;
  offices?: { name?: string | null }[];
}

export function normalizeGemSource(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error("Gem source is required");

  if (!trimmed.includes("://")) {
    if (!/^[a-z0-9][a-z0-9-]*$/i.test(trimmed)) {
      throw new Error("Gem source must be a board slug or jobs.gem.com URL");
    }
    return trimmed;
  }

  const url = new URL(trimmed);
  if (!["jobs.gem.com", "api.gem.com"].includes(url.hostname)) {
    throw new Error("Gem source must use jobs.gem.com or api.gem.com");
  }

  const parts = url.pathname.split("/").filter(Boolean);
  const slug = url.hostname === "api.gem.com"
    ? parts[2]
    : parts[0];
  if (!slug) throw new Error("Gem source URL is missing its board slug");
  return slug;
}

function boardUrl(slug: string) {
  return `https://api.gem.com/job_board/v0/${encodeURIComponent(slug)}/job_posts/`;
}

async function fetchBoard(slug: string): Promise<GemJob[]> {
  const response = await fetchWithTimeout(boardUrl(slug));
  if (!response.ok) throw new Error(`Gem API ${response.status}`);

  const data = await response.json();
  if (!Array.isArray(data)) {
    throw new Error(`Gem API returned an unexpected payload for ${slug}`);
  }
  return data as GemJob[];
}

function mapJob(job: GemJob): JobListing {
  const description = job.content?.trim() || job.content_plain?.trim() || null;
  const officeNames = (job.offices ?? [])
    .map((office) => office.name?.trim())
    .filter((name): name is string => Boolean(name));
  const location = job.location?.name?.trim()
    || [...new Set(officeNames)].join(" / ")
    || "Unknown";

  return {
    externalId: String(job.id),
    title: job.title,
    url: job.absolute_url,
    location,
    department: job.departments?.[0]?.name?.trim() || null,
    postedAt: job.first_published_at ?? null,
    description,
    salary: extractSalaryFromHtml(description),
  };
}

export class GemAdapter implements ATSAdapter {
  readonly name = "gem";

  async fetchJobs(value: string): Promise<JobListing[]> {
    const slug = normalizeGemSource(value);
    return (await fetchBoard(slug)).map(mapJob);
  }

  async fetchJobContent(value: string, externalId: string): Promise<JobContent> {
    const slug = normalizeGemSource(value);
    const job = (await fetchBoard(slug)).find((posting) => String(posting.id) === externalId);
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
