import type { ATSAdapter, JobListing } from "./types";

interface LeverPosting {
  id: string;
  text: string;
  categories: {
    location: string;
    department?: string | null;
  };
  hostedUrl: string;
  createdAt: number;
}

export class LeverAdapter implements ATSAdapter {
  readonly name = "lever";

  async fetchJobs(slug: string): Promise<JobListing[]> {
    try {
      const url = `https://api.lever.co/v0/postings/${slug}?mode=json`;
      const response = await fetch(url);

      if (!response.ok) {
        return [];
      }

      const data: LeverPosting[] = await response.json();

      return data.map((posting) => ({
        externalId: posting.id,
        title: posting.text,
        url: posting.hostedUrl,
        location: posting.categories.location,
        department: posting.categories.department ?? null,
        postedAt: new Date(posting.createdAt).toISOString(),
      }));
    } catch {
      return [];
    }
  }
}
