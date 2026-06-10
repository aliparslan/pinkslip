export interface JobListing {
  externalId: string;
  title: string;
  url: string;
  location: string;
  department: string | null;
  postedAt: string | null;
  description: string | null;
  salary: string | null;
}

export interface JobContent {
  description: string | null;
  salary: string | null;
  location?: string | null;
  postedAt?: string | null;
}

export interface ATSAdapter {
  name: string;
  fetchJobs(slug: string): Promise<JobListing[]>;
  fetchJobContent(slug: string, externalId: string, jobUrl?: string): Promise<JobContent>;
}
