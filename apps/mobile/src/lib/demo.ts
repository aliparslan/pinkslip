/* Sample data for looking at the app without the API: the web preview used
   to check layouts, and screenshots. Turned on with EXPO_PUBLIC_DEMO=1.
   Never used in a shipped build. */

import type { Job } from "@pinkslip/core/api";

export const DEMO = process.env.EXPO_PUBLIC_DEMO === "1";

const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();
const hour = 60;
const day = 24 * hour;

const description = `
<h2>About the role</h2>
<p>You'll join one of our product teams as a full-time engineer, working across the stack on features customers use every day. New grads pair with a mentor for their first quarter and ship to production in their first two weeks.</p>
<p><strong>What you'll do</strong></p>
<ul>
  <li>Build and ship features end to end, from the database to the interface.</li>
  <li>Own a piece of the product and talk directly with the customers who use it.</li>
  <li>Review code, write design docs, and help decide what the team builds next.</li>
</ul>
<h3>What we're looking for</h3>
<ul>
  <li>A degree in computer science or a related field, finishing by June 2027.</li>
  <li>At least one internship or substantial project in a typed language.</li>
  <li><strong>Nice to have:</strong> experience with React, Python, or payments.</li>
</ul>
<p>Learn more at <a href="https://example.com">our careers site</a>.</p>`;

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
    description,
    salary: null,
    closed_at: null,
    company_domain: "",
    saved: false,
    ...fields,
  };
}

export const demoJobs: Job[] = [
  job({ id: "ramp", company_name: "Ramp", title: "Software Engineer, New Grad", location: "New York, NY", salary: "$160,000 - $190,000", posted_at: ago(4), first_seen_at: ago(4) }),
  job({ id: "figma", company_name: "Figma", title: "Software Engineer, Early Career", location: "San Francisco, CA", salary: "$148,000 - $182,000", posted_at: ago(26), first_seen_at: ago(26), saved: true }),
  job({
    id: "stripe",
    company_name: "Stripe",
    title: "Software Engineer, New Grad",
    location: "Seattle, WA | San Francisco, CA | New York, NY | Chicago, IL | Remote (US)",
    salary: "San Francisco or New York: $165,000 - $200,000 | Seattle: $155,000 - $190,000 | Remote: $140,000 - $170,000",
    posted_at: ago(52),
    first_seen_at: ago(50),
    source_type: "greenhouse",
  }),
  job({
    id: "datadog",
    company_name: "Datadog",
    title: "Backend Engineer, Graduate: Distributed Systems, Metrics Ingestion and Long-Term Storage (2026 Start)",
    location: "New York, NY, US / Remote (US)",
    posted_at: ago(3 * hour),
    first_seen_at: ago(3 * hour),
  }),
  job({ id: "notion", company_name: "Notion", title: "Machine Learning Engineer, New Grad", location: "Remote (US)", salary: "$155,000 - $185,000", posted_at: ago(day), first_seen_at: ago(day) }),
  job({ id: "cloudflare", company_name: "Cloudflare", title: "Security Engineer, Early Career", location: "Austin, TX | Denver, CO | Remote (US)", salary: "$128,000 - $156,000", posted_at: ago(5 * day), first_seen_at: ago(5 * day) }),
  job({ id: "janestreet", company_name: "Jane Street", title: "Software Engineer Intern, Summer 2027", location: "New York, NY", salary: "$95/hr", posted_at: ago(40 * day), first_seen_at: ago(40 * day), evergreen: true }),
  job({ id: "plaid", company_name: "Plaid", title: "Analytics Engineer, Early Career", location: "San Francisco, CA", salary: "$135,000 - $160,000", posted_at: ago(9 * day), first_seen_at: ago(9 * day), closed_at: ago(2 * hour) }),
  job({ id: "vercel", company_name: "Vercel", title: "Infrastructure Engineer, New Grad", location: "New York, NY", salary: "$155,000 - $185,000", posted_at: ago(7 * hour), first_seen_at: ago(7 * hour) }),
  job({ id: "linear", company_name: "Linear", title: "Product Engineer, New Grad", location: "Remote (US)", salary: "$140,000 - $170,000", posted_at: ago(2 * day), first_seen_at: ago(2 * day), saved: true }),
];

export const demoViewed = ["datadog", "cloudflare", "plaid", "janestreet"];

export const demoApplied: Job[] = [
  { ...job({ id: "coinbase", company_name: "Coinbase", title: "Software Engineer, Backend", location: "Remote (US)", salary: "$150,000 - $170,000", posted_at: ago(9 * day) }), applied: true, applied_at: ago(5 * day) },
  { ...job({ id: "retool", company_name: "Retool", title: "Frontend Engineer, New Grad", location: "San Francisco, CA", salary: "$140,000 - $165,000", posted_at: ago(12 * day) }), applied: true, applied_at: ago(8 * day) },
  { ...job({ id: "anduril", company_name: "Anduril", title: "Software Engineer, New Grad", location: "Costa Mesa, CA", posted_at: ago(30 * day), closed_at: ago(3 * day) }), applied: true, applied_at: ago(21 * day) },
];
