import type { ATSAdapter, JobContent, JobListing } from "./types";
import { extractSalaryFromHtml } from "./salary";
import { fetchWithTimeout } from "../http";

// Atlassian's careers site reads every role, in full, from one public listing.
const LISTINGS_URL = "https://www.atlassian.com/endpoint/careers/listings";
const SOURCE = "atlassian";
const USER_AGENT = "Mozilla/5.0 (compatible; Pinkslip/1.0; +https://pinkslip.work)";

interface AtlassianJob {
  id: number | string;
  title: string;
  locations?: string[] | null;
  category?: string | null;
  overview?: string | null;
  responsibilities?: string | null;
  qualifications?: string | null;
}

export function normalizeAtlassianSource(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error("Atlassian source is required");
  if (trimmed.toLowerCase() === SOURCE) return SOURCE;

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error('Atlassian source must be "atlassian" or its careers URL');
  }
  if (url.hostname !== "www.atlassian.com" && url.hostname !== "atlassian.com") {
    throw new Error("Atlassian source must use atlassian.com");
  }
  return SOURCE;
}

/**
 * "San Francisco - United States -   San Francisco, California 94104 United States"
 * reads as "San Francisco, United States"; "Remote - UK - Remote" as "Remote - UK".
 */
function cleanLocation(raw: string): string {
  const parts = raw.split(/\s+-\s+/).map((part) => part.trim()).filter(Boolean);
  if (parts.length === 0) return "";
  if (/^remote$/i.test(parts[0]!)) {
    return parts.length > 2 ? `Remote - ${parts[1]}` : "Remote";
  }
  if (parts.length === 1 || parts[0] === parts[1]) return parts[0]!;
  return `${parts[0]}, ${parts[1]!.replace(/\s+or\s+remote$/i, "")}`;
}

function jobLocation(job: AtlassianJob): string {
  const places = [...new Set((job.locations ?? []).map(cleanLocation).filter(Boolean))];
  // A plain "Remote" beside named places means remote in those places.
  // "Bengaluru, India / Remote" must not pass as open to the US.
  const named = places.filter((place) => place !== "Remote");
  return (named.length > 0 ? named : places).join(" / ") || "Unknown";
}

function description(job: AtlassianJob): string | null {
  const sections = [
    job.overview?.trim(),
    job.responsibilities?.trim() ? `<h3>What you'll do</h3>${job.responsibilities.trim()}` : null,
    job.qualifications?.trim() ? `<h3>Requirements</h3>${job.qualifications.trim()}` : null,
  ].filter(Boolean);
  return sections.length > 0 ? sections.join("\n") : null;
}

function mapJob(job: AtlassianJob): JobListing {
  const text = description(job);
  return {
    externalId: String(job.id),
    title: job.title.trim(),
    url: `https://www.atlassian.com/company/careers/details/${job.id}`,
    location: jobLocation(job),
    department: job.category?.trim() || null,
    // The listing only has a last-updated date, which isn't when it was posted.
    postedAt: null,
    description: text,
    salary: extractSalaryFromHtml(text),
  };
}

async function fetchListings(): Promise<AtlassianJob[]> {
  // Atlassian's CDN answers 403 without one, and Workers send none by default.
  const response = await fetchWithTimeout(LISTINGS_URL, { headers: { "user-agent": USER_AGENT } });
  if (!response.ok) throw new Error(`Atlassian listings ${response.status}`);
  const data = await response.json();
  if (!Array.isArray(data)) throw new Error("Atlassian listings returned an unexpected payload");
  // A role can appear once per hiring portal, under the same id.
  const unique = new Map((data as AtlassianJob[]).map((job) => [String(job.id), job]));
  return [...unique.values()];
}

export class AtlassianAdapter implements ATSAdapter {
  readonly name = "atlassian";

  async fetchJobs(value: string): Promise<JobListing[]> {
    normalizeAtlassianSource(value);
    return (await fetchListings()).map(mapJob);
  }

  async fetchJobContent(value: string, externalId: string): Promise<JobContent> {
    normalizeAtlassianSource(value);
    const job = (await fetchListings()).find((posting) => String(posting.id) === externalId);
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
