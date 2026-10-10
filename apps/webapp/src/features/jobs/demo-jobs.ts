import type { JobRowJob } from "./JobRow";

const companies = ["Acme Corporation", "Northstar Labs", "Figma", "Linear", "Ramp", "Notion", "Vercel", "Duolingo"];
const titles = ["Frontend Engineer", "Software Engineer, New Grad", "Product Designer", "Data Analyst", "iOS Engineer", "Backend Engineer II"];
const places = ["Chicago, IL · Remote", "New York, NY", "San Francisco, CA", "Remote (US)", "Seattle, WA; Austin, TX"];

/** Development fixtures for `/_kit` and `/_kit-list`. Timestamps are relative
 * to `now`, so the first few rows are fresh and get the "new" dot. Domains are
 * left out so the demos never fetch logos. */
export function demoJobs(count: number, now = Date.now()): JobRowJob[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `demo-${index + 1}`,
    title: titles[index % titles.length],
    company_name: companies[index % companies.length],
    company_domain: "",
    location: places[index % places.length],
    salary: index % 3 === 0 ? "$120,000–$145,000" : null,
    posted_at: new Date(now - (index * 7 + 2) * 60 * 60 * 1000).toISOString(),
    first_seen_at: new Date(now - (index * 7 + 2) * 60 * 60 * 1000).toISOString(),
    evergreen: index % 11 === 5,
    source_type: index % 2 === 0 ? "greenhouse" : "lever",
    saved: index % 5 === 2,
  }));
}
