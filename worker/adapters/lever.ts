import type { ATSAdapter, JobListing, JobContent } from "./types";
import { extractSalaryFromHtml, formatLeverSalary } from "./salary";
import { fetchWithTimeout } from "../http";

interface LeverPosting {
  id: string;
  text: string;
  categories: {
    location: string;
    department?: string | null;
  };
  hostedUrl: string;
  createdAt: number;
  descriptionPlain?: string;
  description?: string;
  salaryRange?: { min: number; max: number; currency: string; interval: string };
}

export class LeverAdapter implements ATSAdapter {
  readonly name = "lever";

  async fetchJobs(slug: string): Promise<JobListing[]> {
    try {
      const url = `https://api.lever.co/v0/postings/${slug}?mode=json`;
      const response = await fetchWithTimeout(url);

      if (!response.ok) {
        throw new Error(`Lever API ${response.status}`);
      }

      const data: LeverPosting[] = await response.json();

      return data.map((posting) => {
        const salary = formatLeverSalary(posting.salaryRange) ?? extractSalaryFromHtml(posting.description ?? posting.descriptionPlain ?? null);
        return {
          externalId: posting.id,
          title: posting.text,
          url: posting.hostedUrl,
          location: posting.categories.location,
          department: posting.categories.department ?? null,
          postedAt: new Date(posting.createdAt).toISOString(),
          description: posting.description || null,
          salary,
        };
      });
    } catch (e) {
      throw e instanceof Error ? e : new Error(String(e));
    }
  }

  async fetchJobContent(slug: string, externalId: string): Promise<JobContent> {
    const url = `https://api.lever.co/v0/postings/${slug}/${externalId}`;
    const res = await fetchWithTimeout(url);
    if (!res.ok) return { description: null, salary: null };
    const posting: LeverPosting = await res.json();
    return {
      description: posting.description || null,
      salary: formatLeverSalary(posting.salaryRange) ?? extractSalaryFromHtml(posting.description ?? posting.descriptionPlain ?? null),
    };
  }
}
