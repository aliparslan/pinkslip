/* Example content for the playground. Plausible Pinkslip data in the real
   API shapes, not real postings. Times are relative to when the page loads,
   so "4m ago" stays true. */

import type { Job } from "@pinkslip/core/api";

const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();
const hours = 60;
const days = 24 * hours;

function job(fields: Partial<Job> & Pick<Job, "id" | "company_name" | "title">): Job {
  return {
    company_id: `company-${fields.id}`,
    external_id: fields.id,
    url: "https://example.com/careers",
    location: "",
    department: null,
    posted_at: ago(30),
    first_seen_at: ago(30),
    evergreen: false,
    match_fact: null,
    sponsorship_available: null,
    source_type: "ashby",
    dismissed: 0,
    description: null,
    salary: null,
    closed_at: null,
    company_domain: "",
    saved: false,
    ...fields,
  };
}

/** One job per state a feed row has to handle. */
export const sampleJobs: Job[] = [
  job({
    id: "ramp-swe-ng",
    company_name: "Ramp",
    title: "Software Engineer, New Grad",
    location: "New York, NY",
    salary: "$160,000 - $190,000",
    posted_at: ago(4),
    first_seen_at: ago(3),
    match_fact: "New-grad role",
  }),
  job({
    id: "figma-swe-ec",
    company_name: "Figma",
    title: "Software Engineer, Early Career",
    location: "San Francisco, California, United States",
    salary: "$148,000—$182,000",
    posted_at: ago(26),
    first_seen_at: ago(40),
    source_type: "greenhouse",
    match_fact: "Early-career role",
    saved: true,
  }),
  job({
    id: "datadog-be-grad",
    company_name: "Datadog",
    title: "Backend Engineer, Graduate: Distributed Systems, Metrics Ingestion and Long-Term Storage (2026 Start)",
    location: "New York, NY, US / Remote (US)",
    posted_at: ago(3 * hours),
    first_seen_at: ago(3 * hours),
    match_fact: "Asks for 1+ years",
  }),
  job({
    id: "notion-ml-ng",
    company_name: "Notion",
    title: "Machine Learning Engineer, New Grad",
    location: "Remote - US",
    salary: "$155K - $185K",
    posted_at: ago(30 * hours),
    first_seen_at: ago(29 * hours),
    match_fact: "New-grad role",
    sponsorship_available: true,
  }),
  job({
    id: "cloudflare-sec-ec",
    company_name: "Cloudflare",
    title: "Security Engineer, Early Career",
    location: "Austin, TX | Denver, CO | Atlanta, GA",
    salary: "$128,000 - $156,000",
    posted_at: ago(5 * days),
    first_seen_at: ago(5 * days),
    match_fact: "Early-career role",
  }),
  job({
    id: "jane-street-intern",
    company_name: "Jane Street",
    title: "Software Engineer Intern, Summer 2027",
    location: "New York, NY",
    salary: "Offers Equity",
    posted_at: ago(40 * days),
    first_seen_at: ago(40 * days),
    evergreen: true,
    match_fact: "Internship",
  }),
  job({
    id: "plaid-ae-ec",
    company_name: "Plaid",
    title: "Analytics Engineer, Early Career",
    location: "San Francisco, CA",
    salary: "$135,000 - $160,000",
    posted_at: ago(9 * days),
    first_seen_at: ago(9 * days),
    closed_at: ago(2 * hours),
    match_fact: "Experience not specified",
  }),
];

/** More of the feed, for demos that need to scroll or search. */
export const moreJobs: Job[] = [
  job({
    id: "stripe-swe-ng",
    company_name: "Stripe",
    title: "Software Engineer, New Grad",
    location: "Seattle, WA | San Francisco, CA",
    salary: "$165,000 - $200,000",
    posted_at: ago(52),
    first_seen_at: ago(50),
  }),
  job({
    id: "databricks-de",
    company_name: "Databricks",
    title: "Data Engineer, New Grad",
    location: "Mountain View, CA",
    salary: "$140,000 - $170,000",
    posted_at: ago(2 * hours),
    first_seen_at: ago(2 * hours),
  }),
  job({
    id: "scale-mle",
    company_name: "Scale AI",
    title: "ML Research Engineer, Early Career",
    location: "San Francisco, CA",
    posted_at: ago(7 * hours),
    first_seen_at: ago(7 * hours),
  }),
  job({
    id: "retool-fe",
    company_name: "Retool",
    title: "Frontend Engineer, New Grad",
    location: "San Francisco, CA",
    salary: "$150,000 - $170,000",
    posted_at: ago(20 * hours),
    first_seen_at: ago(20 * hours),
    saved: true,
  }),
  job({
    id: "duolingo-ios",
    company_name: "Duolingo",
    title: "iOS Engineer, New Grad",
    location: "Pittsburgh, PA",
    salary: "$135,000 - $160,000",
    posted_at: ago(2 * days),
    first_seen_at: ago(2 * days),
  }),
  job({
    id: "coinbase-be",
    company_name: "Coinbase",
    title: "Backend Engineer, University Grad",
    location: "Remote - US",
    salary: "$152,000 - $179,000",
    posted_at: ago(3 * days),
    first_seen_at: ago(3 * days),
  }),
  job({
    id: "two-sigma-swe",
    company_name: "Two Sigma",
    title: "Software Engineer, Campus",
    location: "New York, NY",
    salary: "$200,000 - $225,000",
    posted_at: ago(4 * days),
    first_seen_at: ago(4 * days),
  }),
  job({
    id: "anduril-swe",
    company_name: "Anduril",
    title: "Software Engineer, Early Career",
    location: "Costa Mesa, CA | Seattle, WA",
    salary: "$129,000 - $171,000",
    posted_at: ago(6 * days),
    first_seen_at: ago(6 * days),
  }),
];

/** A longer feed, for demos that scroll or search. */
export const feedJobs: Job[] = [...sampleJobs, ...moreJobs];

/** Jobs already applied to, as the Applied list shows them. */
export const appliedJobs: Job[] = [
  job({
    id: "linear-pe",
    company_name: "Linear",
    title: "Product Engineer, Early Career",
    location: "Remote",
    posted_at: ago(12 * days),
    applied: true,
    applied_at: ago(3 * days),
  }),
  job({
    id: "vercel-infra-ng",
    company_name: "Vercel",
    title: "Infrastructure Engineer, New Grad",
    location: "Remote - US",
    salary: "$150,000 - $175,000",
    posted_at: ago(20 * days),
    applied: true,
    applied_at: ago(9 * days),
  }),
];

export const companies = [
  "Airbnb", "Anduril", "Asana", "Brex", "Cloudflare", "Coinbase", "Databricks", "Datadog",
  "Discord", "DoorDash", "Duolingo", "Figma", "Jane Street", "Linear", "Lyft", "Mercury",
  "Notion", "Palantir", "Plaid", "Ramp", "Retool", "Robinhood", "Rippling", "Scale AI",
  "Snowflake", "Stripe", "Two Sigma", "Vercel", "Watershed", "Wiz",
];

export const roles = [
  "Software Engineer, New Grad",
  "Software Engineer, Early Career",
  "Backend Engineer",
  "Frontend Engineer",
  "Full Stack Engineer",
  "Infrastructure Engineer",
  "Machine Learning Engineer",
  "Data Engineer",
  "Security Engineer",
  "Mobile Engineer, iOS",
  "Site Reliability Engineer",
];
