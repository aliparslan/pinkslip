import type { ATSAdapter, JobListing, JobContent } from "./types";
import { extractSalaryFromHtml } from "./salary";

interface AshbyJobPosting {
  id: string;
  title: string;
  location: string;
  department?: string | null;
  team?: string | null;
  publishedAt: string | null;
  jobUrl: string;
  applyUrl?: string | null;
  descriptionHtml: string | null;
  descriptionPlain?: string | null;
  compensation?: {
    compensationTierSummary?: string | null;
  } | null;
}

interface AshbyResponse {
  jobs?: AshbyJobPosting[];
  apiVersion?: string;
}

function ashbyBoardUrl(slug: string) {
  return `https://api.ashbyhq.com/posting-api/job-board/${slug}?includeCompensation=true`;
}

function getAshbyJobs(data: AshbyResponse, slug: string) {
  if (!Array.isArray(data.jobs)) {
    throw new Error(`Ashby API returned an unexpected payload for ${slug}`);
  }
  return data.jobs;
}

function mapAshbyJob(posting: AshbyJobPosting): JobListing {
  return {
    externalId: posting.id,
    title: posting.title,
    url: posting.jobUrl,
    location: posting.location,
    department: posting.department ?? posting.team ?? null,
    postedAt: posting.publishedAt ?? null,
    description: posting.descriptionHtml || null,
    salary:
      posting.compensation?.compensationTierSummary
      || extractSalaryFromHtml(posting.descriptionHtml ?? posting.descriptionPlain ?? null),
  };
}

export class AshbyAdapter implements ATSAdapter {
  readonly name = "ashby";

  async fetchJobs(slug: string): Promise<JobListing[]> {
    try {
      const response = await fetch(ashbyBoardUrl(slug));

      if (!response.ok) {
        throw new Error(`Ashby API ${response.status}`);
      }

      const data: AshbyResponse = await response.json();
      return getAshbyJobs(data, slug).map(mapAshbyJob);
    } catch (e) {
      throw e instanceof Error ? e : new Error(String(e));
    }
  }

  async fetchJobContent(slug: string, externalId: string): Promise<JobContent> {
    const res = await fetch(ashbyBoardUrl(slug));
    if (!res.ok) return { description: null, salary: null };
    const data: AshbyResponse = await res.json();
    const posting = getAshbyJobs(data, slug).find((p) => p.id === externalId);
    if (!posting) return { description: null, salary: null };
    return {
      description: posting.descriptionHtml || null,
      salary:
        posting.compensation?.compensationTierSummary
        || extractSalaryFromHtml(posting.descriptionHtml ?? posting.descriptionPlain ?? null),
    };
  }
}
