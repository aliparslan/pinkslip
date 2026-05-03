import type { ATSAdapter, JobListing, JobContent } from "./types";
import { formatGreenhouseSalary } from "./salary";

interface GreenhouseJob {
  id: number;
  title: string;
  location: { name: string };
  departments: { name: string }[];
  absolute_url: string;
  updated_at: string;
  content: string;
  pay_input_ranges?: { min_cents: number; max_cents: number; currency_type: string; title: string }[];
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
        throw new Error(`Greenhouse API ${response.status}`);
      }

      const data: GreenhouseResponse = await response.json();

      return data.jobs.map((job) => {
        const salary = formatGreenhouseSalary(job.pay_input_ranges?.[0]);
        return {
          externalId: String(job.id),
          title: job.title,
          url: job.absolute_url,
          location: job.location.name,
          department: job.departments[0]?.name ?? null,
          postedAt: job.updated_at,
          description: job.content || null,
          salary,
        };
      });
    } catch (e) {
      throw e instanceof Error ? e : new Error(String(e));
    }
  }

  async fetchJobContent(slug: string, externalId: string): Promise<JobContent> {
    const url = `https://boards-api.greenhouse.io/v1/boards/${slug}/jobs/${externalId}`;
    const res = await fetch(url);
    if (!res.ok) return { description: null, salary: null };
    const job: GreenhouseJob = await res.json();
    return { description: job.content || null, salary: formatGreenhouseSalary(job.pay_input_ranges?.[0]) };
  }
}
