import { Hono } from "hono";
import type { Env, JobRow } from "../types";

const jobs = new Hono<{ Bindings: Env }>();

// GET / — List jobs
jobs.get("/", async (c) => {
  const { min_score, company_id, dismissed, limit, offset } = c.req.query();

  const limitVal = Math.min(parseInt(limit ?? "100", 10) || 100, 500);
  const offsetVal = parseInt(offset ?? "0", 10) || 0;

  const conditions: string[] = [];
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
  }

  if (company_id !== undefined) {
    conditions.push("j.company_id = ?");
    bindings.push(company_id);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const sql = `
    SELECT j.*, c.name AS company_name
    FROM jobs j
    JOIN companies c ON j.company_id = c.id
    ${where}
    ORDER BY j.first_seen_at DESC
    LIMIT ? OFFSET ?
  `;

  bindings.push(limitVal, offsetVal);

  const stmt = c.env.DB.prepare(sql);
  const result = await stmt.bind(...bindings).all<JobRow & { company_name: string }>();

  return c.json(result.results ?? []);
});

// GET /:id — Job detail
jobs.get("/:id", async (c) => {
  const { id } = c.req.param();

  const result = await c.env.DB.prepare(
    `SELECT j.*, c.name AS company_name
     FROM jobs j
     JOIN companies c ON j.company_id = c.id
     WHERE j.id = ?`
  )
    .bind(id)
    .first<JobRow & { company_name: string }>();

  if (!result) {
    return c.json({ error: "Not found" }, 404);
  }

  return c.json(result);
});

// PATCH /:id — Update job
jobs.patch("/:id", async (c) => {
  const { id } = c.req.param();
  const body = await c.req.json<{ dismissed?: boolean }>();

  const setClauses: string[] = [];
  const bindings: (number | string)[] = [];

  if (body.dismissed !== undefined) {
    setClauses.push("dismissed = ?");
    bindings.push(body.dismissed ? 1 : 0);
  }

  if (setClauses.length === 0) {
    return c.json({ error: "No fields to update" }, 400);
  }

  bindings.push(id);

  await c.env.DB.prepare(
    `UPDATE jobs SET ${setClauses.join(", ")} WHERE id = ?`
  )
    .bind(...bindings)
    .run();

  const updated = await c.env.DB.prepare(
    `SELECT j.*, c.name AS company_name
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

export default jobs;
