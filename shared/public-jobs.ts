/** Anonymous catalog data. Personal and administrative fields are never part of this contract. */
export interface PublicJobSummary {
  id: string;
  title: string;
  url: string;
  company_name: string;
  company_domain: string;
  location: string;
  department: string | null;
  salary: string | null;
  posted_at: string | null;
  first_seen_at: string;
  evergreen: boolean;
}
export interface PublicJob extends PublicJobSummary {
  description: string | null;
}
export interface PublicJobList {
  jobs: PublicJobSummary[];
}
