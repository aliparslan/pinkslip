import type { ATSAdapter, JobListing } from "./types";

interface GreenhouseJob {
  id: number;
  title: string;
  location: { name: string };
  departments: { name: string }[];
  absolute_url: string;
  updated_at: string;
}

interface GreenhouseResponse {
  jobs: GreenhouseJob[];
}

export class GreenhouseAdapter implements ATSAdapter {
  readonly name = "greenhouse";

  async fetchJobs(slug: string): Promise<JobListing[]> {
    try {
      const url = `https://boards-api.greenhouse.io/v1/boards/${slug}/jobs?content=true`;
      const response = await fetch(url);

      if (!response.ok) {
        return [];
      }

      const data: GreenhouseResponse = await response.json();

      return data.jobs.map((job) => ({
        externalId: String(job.id),
        title: job.title,
        url: job.absolute_url,
        location: job.location.name,
        department: job.departments[0]?.name ?? null,
        postedAt: job.updated_at,
      }));
    } catch {
      return [];
    }
  }
}
