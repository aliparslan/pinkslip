export interface JobListing {
  externalId: string;
  title: string;
  url: string;
  location: string;
  department: string | null;
  postedAt: string | null;
}

export interface ATSAdapter {
  name: string;
  fetchJobs(slug: string): Promise<JobListing[]>;
}
