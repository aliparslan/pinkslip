/* Example content for the playground. Plausible Pinkslip data, not real
   postings. */

export interface ExampleJob {
  id: string;
  company: string;
  title: string;
  location: string;
  salary?: string;
  posted: string;
}

export const exampleJobs: ExampleJob[] = [
  { id: "ramp-se-ng", company: "Ramp", title: "Software Engineer, New Grad", location: "New York", salary: "$160k–$190k", posted: "4m" },
  { id: "figma-se-ec", company: "Figma", title: "Software Engineer, Early Career", location: "San Francisco", salary: "$148k–$182k", posted: "26m" },
  { id: "datadog-be", company: "Datadog", title: "Backend Engineer, Graduate", location: "New York", posted: "1h" },
  { id: "notion-ml", company: "Notion", title: "Machine Learning Engineer, New Grad", location: "Remote, US", salary: "$155k–$185k", posted: "3h" },
  { id: "cloudflare-sec", company: "Cloudflare", title: "Security Engineer, Early Career", location: "Austin", salary: "$128k–$156k", posted: "5h" },
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

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((word) => word[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}
