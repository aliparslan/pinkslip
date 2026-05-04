import { Hono } from "hono";
import type { Env, Variables, JobRow, CompanyRow } from "../types";
import { getAdapter } from "../ats";

const jobs = new Hono<{ Bindings: Env; Variables: Variables }>();
const JOB_FIELDS = `
  j.id,
  j.company_id,
  j.external_id,
  j.title,
  j.url,
  j.location,
  j.department,
  j.posted_at,
  j.first_seen_at,
  j.score,
  j.title_score,
  j.yoe_score,
  j.location_score,
  j.department_score,
  j.recency_score,
  CAST(
    EXISTS(
      SELECT 1
      FROM dismissed_jobs d
      WHERE d.user_id = ? AND d.job_id = j.id
    ) AS INTEGER
  ) AS dismissed,
  j.description,
  j.salary,
  j.closed_at,
  CAST(
    EXISTS(
      SELECT 1
      FROM saved_jobs s
      WHERE s.user_id = ? AND s.job_id = j.id
    ) AS INTEGER
  ) AS saved,
  c.name AS company_name,
  c.website AS company_domain
`;

type JobListRow = JobRow & {
  company_name: string;
  company_domain: string;
  saved: number;
};

// GET / — List jobs
jobs.get("/", async (c) => {
  const userId = c.get("userId");
  const { min_score, company_id, dismissed, limit, offset } = c.req.query();

  const limitVal = Math.min(parseInt(limit ?? "2000", 10) || 2000, 5000);
  const offsetVal = parseInt(offset ?? "0", 10) || 0;

  const conditions: string[] = ["c.enabled = 1", "j.closed_at IS NULL"];
  const bindings: (string | number)[] = [userId, userId];

  // Default excludes dismissed unless explicitly requested
  if (dismissed === "true") {
    conditions.push(
      `EXISTS (
        SELECT 1
        FROM dismissed_jobs d
        WHERE d.user_id = ? AND d.job_id = j.id
      )`
    );
    bindings.push(userId);
  } else if (dismissed === undefined || dismissed === "false") {
    conditions.push(
      `NOT EXISTS (
        SELECT 1
        FROM dismissed_jobs d
        WHERE d.user_id = ? AND d.job_id = j.id
      )`
    );
    bindings.push(userId);
  }
  // dismissed=all → no filter

  if (min_score !== undefined) {
    conditions.push("j.score >= ?");
    bindings.push(parseFloat(min_score));
    conditions.push("j.title NOT LIKE '%Senior%' AND j.title NOT LIKE '%Staff%' AND j.title NOT LIKE '%Principal%' AND j.title NOT LIKE '%Director%' AND j.title NOT LIKE '%Intern,%' AND j.title NOT LIKE '%Internship%'");
  }

  if (company_id !== undefined) {
    conditions.push("j.company_id = ?");
    bindings.push(company_id);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const sql = `
    SELECT ${JOB_FIELDS}
    FROM jobs j
    JOIN companies c ON j.company_id = c.id
    ${where}
    ORDER BY datetime(COALESCE(j.posted_at, j.first_seen_at)) DESC, j.first_seen_at DESC
    LIMIT ? OFFSET ?
  `;

  bindings.push(limitVal, offsetVal);

  const stmt = c.env.DB.prepare(sql);
  const result = await stmt.bind(...bindings).all<JobListRow>();
  const rows = result.results ?? [];

  return c.json({ jobs: rows, meta: { total: rows.length } });
});

async function backfillJobContent(
  db: D1Database,
  job: { id: string; external_id: string; ats_type: string; ats_slug: string }
) {
  const adapter = getAdapter(job.ats_type as CompanyRow["ats_type"]);
  if (!adapter) return;

  const content = await adapter.fetchJobContent(job.ats_slug, job.external_id);
  if (!content.description && !content.salary) return;

  const sets: string[] = [];
  const vals: (string | null)[] = [];
  if (content.description) {
    sets.push("description = ?");
    vals.push(content.description);
  }
  if (content.salary) {
    sets.push("salary = ?");
    vals.push(content.salary);
  }
  vals.push(job.id);
  await db.prepare(`UPDATE jobs SET ${sets.join(", ")} WHERE id = ?`).bind(...vals).run();
}

// GET /:id — Job detail (backfills description on demand)
jobs.get("/:id", async (c) => {
  const { id } = c.req.param();
  const userId = c.get("userId");
  const db = c.env.DB;

  const result = await db.prepare(
    `SELECT ${JOB_FIELDS}, c.ats_type, c.ats_slug
     FROM jobs j
     JOIN companies c ON j.company_id = c.id
     WHERE j.id = ?`
  )
    .bind(userId, userId, id)
    .first<JobListRow & { ats_type: string; ats_slug: string }>();

  if (!result) {
    return c.json({ error: "Not found" }, 404);
  }

  if (result.description === null) {
    c.executionCtx.waitUntil(
      backfillJobContent(db, result).catch((error) => {
        console.error("Description backfill failed:", error);
      })
    );
  }

  return c.json(result);
});

// PATCH /:id — Update job
jobs.patch("/:id", async (c) => {
  const userId = c.get("userId");
  const { id } = c.req.param();
  const body = await c.req.json<{ dismissed?: boolean; saved?: boolean }>();

  if (body.dismissed === undefined && body.saved === undefined) {
    return c.json({ error: "No fields to update" }, 400);
  }

  if (body.dismissed !== undefined) {
    if (body.dismissed) {
      await c.env.DB.prepare(
        `INSERT OR IGNORE INTO dismissed_jobs (user_id, job_id, dismissed_at)
         VALUES (?, ?, ?)`
      ).bind(userId, id, new Date().toISOString()).run();
    } else {
      await c.env.DB.prepare(
        `DELETE FROM dismissed_jobs WHERE user_id = ? AND job_id = ?`
      ).bind(userId, id).run();
    }
  }

  // Sync saved_jobs table (scoped to user)
  if (body.saved !== undefined) {
    if (body.saved) {
      await c.env.DB.prepare(
        `INSERT OR IGNORE INTO saved_jobs (user_id, job_id) VALUES (?, ?)`
      ).bind(userId, id).run();
    } else {
      await c.env.DB.prepare(
        `DELETE FROM saved_jobs WHERE user_id = ? AND job_id = ?`
      ).bind(userId, id).run();
    }
  }

  const updated = await c.env.DB.prepare(
    `SELECT ${JOB_FIELDS}
     FROM jobs j
     JOIN companies c ON j.company_id = c.id
     WHERE j.id = ?`
  )
    .bind(userId, userId, id)
    .first<JobListRow>();

  if (!updated) {
    return c.json({ error: "Not found" }, 404);
  }

  return c.json(updated);
});

// DELETE /:id/block — Permanently block a job globally (never returns from polls)
jobs.delete("/:id/block", async (c) => {
  const { id } = c.req.param();

  const job = await c.env.DB.prepare(
    "SELECT id, company_id, external_id, title FROM jobs WHERE id = ?"
  )
    .bind(id)
    .first<{ id: string; company_id: string; external_id: string; title: string }>();

  if (!job) {
    return c.json({ error: "Not found" }, 404);
  }

  await c.env.DB.prepare(
    `INSERT OR IGNORE INTO blocked_jobs (id, company_id, external_id, title, blocked_at)
     VALUES (?, ?, ?, ?, ?)`
  )
    .bind(crypto.randomUUID(), job.company_id, job.external_id, job.title, new Date().toISOString())
    .run();

  await c.env.DB.prepare("DELETE FROM jobs WHERE id = ?").bind(id).run();

  return c.body(null, 204);
});

// GET /saved — List saved jobs for current user
jobs.get("/saved/list", async (c) => {
  const userId = c.get("userId");
  const result = await c.env.DB.prepare(
    `SELECT ${JOB_FIELDS}
     FROM jobs j
     JOIN companies c ON j.company_id = c.id
     JOIN saved_jobs s ON s.job_id = j.id AND s.user_id = ?
     ORDER BY datetime(COALESCE(j.posted_at, j.first_seen_at)) DESC, j.first_seen_at DESC`
  ).bind(userId, userId, userId).all<JobListRow>();

  return c.json({ jobs: result.results ?? [] });
});

export default jobs;
