import { Hono } from "hono";
import type { Env } from "../types";
import type { PublicJob, PublicJobSummary } from "../../shared/public-jobs";
import { MAX_POSTED_AGE_DAYS } from "../../shared/job-policy";
import { resolveJobId } from "../job-identity";
import { catalogCareerStage, type ClassifiedSeniority } from "../job-features";
import { isUsJobLocation } from "../us-jobs";

const publicJobs = new Hono<{ Bindings: Env }>();

// Anonymous reads never run session resolution, user matching, content
// backfills, or other writes. Ingestion owns catalog eligibility.
const fields = `
  j.id, j.title, j.url, j.location, j.department, j.salary,
  j.posted_at, j.first_seen_at, j.evergreen,
  c.name AS company_name, c.website AS company_domain,
  jf.seniority, jf.min_years, jf.requires_security_clearance
`;
const fromPublished = `
  FROM jobs j
  JOIN companies c ON c.id = j.company_id
  JOIN job_features jf ON jf.job_id = j.id
  LEFT JOIN job_review_queue review ON review.job_id = j.id
  WHERE c.enabled = 1 AND j.closed_at IS NULL
    AND j.description IS NOT NULL AND trim(j.description) != ''
    AND COALESCE(jf.requires_security_clearance, 0) = 0
    AND (review.job_id IS NULL OR review.state = 'approved')
    AND (j.evergreen = 1 OR j.posted_at IS NULL
      OR datetime(j.posted_at) > datetime('now', '-${MAX_POSTED_AGE_DAYS + 1} days'))
`;
type SummaryRow = Omit<PublicJobSummary, "evergreen"> & {
  evergreen: number;
  seniority: ClassifiedSeniority;
  min_years: number | null;
  requires_security_clearance: number | null;
};

/** The baseline every signed-in feed shares before personal preferences: an
 * early-career stage within the experience ceiling, in the US. Without it the
 * public pages would show senior roles the app itself never lists. */
function eligible(row: SummaryRow): boolean {
  return catalogCareerStage({ seniority: row.seniority, min_years: row.min_years }) !== null
    && isUsJobLocation(row.location);
}

// Explicit serialization prevents a future SQL join from accidentally leaking
// personal fields, source configuration, or moderation notes into SSR.
function summary(row: SummaryRow): PublicJobSummary {
  return {
    id: row.id, title: row.title, url: row.url,
    company_name: row.company_name, company_domain: row.company_domain,
    location: row.location, department: row.department, salary: row.salary,
    posted_at: row.posted_at, first_seen_at: row.first_seen_at,
    evergreen: row.evergreen === 1,
  };
}

publicJobs.get("/jobs", async (c) => {
  // A bounded public preview, not the user's filtered or personalized feed.
  const { results } = await c.env.DB.prepare(`
    SELECT ${fields} ${fromPublished}
    ORDER BY datetime(COALESCE(j.posted_at, j.first_seen_at)) DESC,
      j.first_seen_at DESC, j.id DESC
    LIMIT 150
  `).all<SummaryRow>();
  // Location eligibility is code, not SQL, so over-fetch and filter here.
  return c.json({ jobs: results.filter(eligible).slice(0, 30).map(summary) });
});

publicJobs.get("/jobs/:id", async (c) => {
  const id = await resolveJobId(c.env.DB, c.req.param("id"));
  const row = await c.env.DB.prepare(`
    SELECT ${fields}, j.description ${fromPublished} AND j.id = ?
  `).bind(id).first<SummaryRow & { description: string | null }>();
  if (!row || !eligible(row)) return c.json({ error: "Job not found" }, 404);
  return c.json({ ...summary(row), description: row.description } satisfies PublicJob);
});

// Unknown paths and writes stop here, before the session-creating middleware.
publicJobs.all("*", (c) => c.json({ error: "Not found" }, 404));
export default publicJobs;
