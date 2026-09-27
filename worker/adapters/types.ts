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

/**
 * A cheap, stable identity from a complete public manifest such as a sitemap.
 * The poller compares these references with D1 before requesting job details,
 * so large boards do not have to download every description on every cycle.
 */
export interface JobReference {
  externalId: string;
  url: string;
}

export interface ATSAdapter {
  name: string;
  /**
   * Optional complete identity manifest used to discover unknown jobs and track
   * removals without downloading every detail page. Adapters exposing it must
   * also implement `fetchJobListing` and return a complete, validated snapshot.
   */
  fetchDiscoveryJobReferences?(slug: string): Promise<JobReference[]>;
  /** Fetch and validate one complete listing referenced by the manifest above. */
  fetchJobListing?(
    slug: string,
    externalId: string,
    jobUrl?: string
  ): Promise<JobListing>;
  /**
   * Optional newest-first discovery feed for boards whose authoritative catalog
   * is too large to fetch inside every scheduled poll. Results from this method
   * must never be used to infer that an absent job has closed.
   */
  fetchDiscoveryJobs?(slug: string): Promise<JobListing[]>;
  fetchJobs(slug: string): Promise<JobListing[]>;
  fetchJobContent(slug: string, externalId: string, jobUrl?: string): Promise<JobContent>;
}
