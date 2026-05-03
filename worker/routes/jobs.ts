import { Hono } from "hono";
import type { Env, Variables, JobRow, CompanyRow } from "../types";
import { GreenhouseAdapter } from "../adapters/greenhouse";
import { LeverAdapter } from "../adapters/lever";
import { AshbyAdapter } from "../adapters/ashby";

const jobs = new Hono<{ Bindings: Env; Variables: Variables }>();

// GET / — List jobs
jobs.get("/", async (c) => {
  const { min_score, company_id, dismissed, limit, offset } = c.req.query();

  const limitVal = Math.min(parseInt(limit ?? "2000", 10) || 2000, 5000);
  const offsetVal = parseInt(offset ?? "0", 10) || 0;

  const conditions: string[] = ["c.enabled = 1"];
  const bindings: (string | number)[] = [];

  // Default excludes dismissed unless explicitly requested
  if (dismissed === "true") {
    conditions.push("j.dismissed = 1");
  } else if (dismissed === undefined || dismissed === "false") {
    conditions.push("j.dismissed = 0");
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
    SELECT j.*, c.name AS company_name, c.website AS company_domain
    FROM jobs j
    JOIN companies c ON j.company_id = c.id
    ${where}
    ORDER BY COALESCE(j.posted_at, j.first_seen_at) DESC
    LIMIT ? OFFSET ?
  `;

  bindings.push(limitVal, offsetVal);

  const stmt = c.env.DB.prepare(sql);
  const result = await stmt.bind(...bindings).all<JobRow & { company_name: string }>();

  return c.json({ jobs: result.results ?? [] });
});

// GET /:id — Job detail (backfills description on demand)
jobs.get("/:id", async (c) => {
  const { id } = c.req.param();
  const db = c.env.DB;

  const result = await db.prepare(
    `SELECT j.*, c.name AS company_name, c.website AS company_domain, c.ats_type, c.ats_slug
     FROM jobs j
     JOIN companies c ON j.company_id = c.id
     WHERE j.id = ?`
  )
    .bind(id)
    .first<JobRow & { company_name: string; ats_type: string; ats_slug: string }>();

  if (!result) {
    return c.json({ error: "Not found" }, 404);
  }

  if (result.description === null) {
    const adapters: Record<string, { fetchJobContent(slug: string, extId: string): Promise<{ description: string | null; salary: string | null }> }> = {
      greenhouse: new GreenhouseAdapter(),
      lever: new LeverAdapter(),
      ashby: new AshbyAdapter(),
    };
    const adapter = adapters[result.ats_type];
    if (adapter) {
      try {
        const content = await adapter.fetchJobContent(result.ats_slug, result.external_id);
        if (content.description || content.salary) {
          const sets: string[] = [];
          const vals: (string | null)[] = [];
          if (content.description) { sets.push("description = ?"); vals.push(content.description); }
          if (content.salary) { sets.push("salary = ?"); vals.push(content.salary); }
          vals.push(id);
          await db.prepare(`UPDATE jobs SET ${sets.join(", ")} WHERE id = ?`).bind(...vals).run();
          if (content.description) result.description = content.description;
          if (content.salary) result.salary = content.salary;
        }
      } catch (e) { console.error("Description backfill failed:", e); }
    }
  }

  return c.json(result);
});

// PATCH /:id — Update job
jobs.patch("/:id", async (c) => {
  const { id } = c.req.param();
  const body = await c.req.json<{ dismissed?: boolean; saved?: boolean }>();

  const setClauses: string[] = [];
  const bindings: (number | string)[] = [];

  if (body.dismissed !== undefined) {
    setClauses.push("dismissed = ?");
    bindings.push(body.dismissed ? 1 : 0);
  }

  if (setClauses.length === 0 && body.saved === undefined) {
    return c.json({ error: "No fields to update" }, 400);
  }

  if (setClauses.length > 0) {
    bindings.push(id);
    await c.env.DB.prepare(
      `UPDATE jobs SET ${setClauses.join(", ")} WHERE id = ?`
    )
      .bind(...bindings)
      .run();
  }

  // Sync saved_jobs table (scoped to user)
  if (body.saved !== undefined) {
    const userId = c.get("userId");
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
    `SELECT j.*, c.name AS company_name, c.website AS company_domain
     FROM jobs j
     JOIN companies c ON j.company_id = c.id
     WHERE j.id = ?`
  )
    .bind(id)
    .first<JobRow & { company_name: string }>();

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
     VALUES (?, ?, ?, ?, datetime('now'))`
  )
    .bind(crypto.randomUUID(), job.company_id, job.external_id, job.title)
    .run();

  await c.env.DB.prepare("DELETE FROM jobs WHERE id = ?").bind(id).run();

  return c.body(null, 204);
});

// GET /saved — List saved jobs for current user
jobs.get("/saved/list", async (c) => {
  const userId = c.get("userId");
  const result = await c.env.DB.prepare(
    `SELECT j.*, c.name AS company_name, c.website AS company_domain
     FROM jobs j
     JOIN companies c ON j.company_id = c.id
     JOIN saved_jobs s ON s.job_id = j.id AND s.user_id = ?
     ORDER BY j.first_seen_at DESC`
  ).bind(userId).all<JobRow & { company_name: string }>();

  return c.json({ jobs: result.results ?? [] });
});

export default jobs;
