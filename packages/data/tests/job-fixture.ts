import type { Job } from "@pinkslip/core/api";

export function makeJob(overrides: Partial<Job> = {}): Job {
  return {
    id: "job-1",
    company_id: "company-1",
    external_id: "ext-1",
    title: "Engineer",
    url: "https://example.test/job",
    location: "Remote",
    department: null,
    posted_at: null,
    first_seen_at: "2026-10-09T00:00:00.000Z",
    evergreen: false,
    dismissed: 0,
    description: null,
    salary: null,
    closed_at: null,
    company_name: "Acme",
    company_domain: "example.test",
    ...overrides,
  };
}
