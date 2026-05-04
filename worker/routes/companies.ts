import { Hono } from "hono";
import type { Env, CompanyRow } from "../types";
import { loadPreferencesForPoll, pollCompany } from "../poller";
import { verifyCompanySource } from "../ats";

const companies = new Hono<{ Bindings: Env }>();

// GET / — List companies
companies.get("/", async (c) => {
  const { ats_type } = c.req.query();

  const conditions: string[] = [];
  const bindings: string[] = [];

  if (ats_type !== undefined) {
    conditions.push("ats_type = ?");
    bindings.push(ats_type);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const result = await c.env.DB.prepare(
    `SELECT * FROM companies ${where} ORDER BY name ASC`
  )
    .bind(...bindings)
    .all<CompanyRow>();

  return c.json({ companies: result.results ?? [] });
});

// POST /verify — Test an ATS slug without persisting it
companies.post("/verify", async (c) => {
  const body = await c.req.json<{
    ats_type: CompanyRow["ats_type"];
    ats_slug: string;
  }>();

  try {
    const jobs = await verifyCompanySource({
      ats_type: body.ats_type,
      ats_slug: body.ats_slug.trim(),
    });
    return c.json({
      ok: true,
      sample_jobs: jobs.slice(0, 3),
      total_jobs: jobs.length,
    });
  } catch (error) {
    return c.json({
      ok: false,
      error: error instanceof Error ? error.message : "Verification failed",
    });
  }
});

// POST / — Add company
companies.post("/", async (c) => {
  const body = await c.req.json<{
    name: string;
    ats_type: CompanyRow["ats_type"];
    ats_slug: string;
    website?: string;
  }>();

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await c.env.DB.prepare(
    `INSERT INTO companies (id, name, ats_type, ats_slug, website, enabled, added_at)
     VALUES (?, ?, ?, ?, ?, 1, ?)`
  )
    .bind(id, body.name, body.ats_type, body.ats_slug, body.website ?? null, now)
    .run();

  const created = await c.env.DB.prepare(
    "SELECT * FROM companies WHERE id = ?"
  )
    .bind(id)
    .first<CompanyRow>();

  return c.json(created, 201);
});

// PATCH /:id — Update company
companies.patch("/:id", async (c) => {
  const { id } = c.req.param();
  const body = await c.req.json<{
    enabled?: boolean;
    name?: string;
    ats_slug?: string;
    ats_type?: CompanyRow["ats_type"];
    website?: string;
  }>();

  const setClauses: string[] = [];
  const bindings: (string | number)[] = [];

  if (body.enabled !== undefined) {
    setClauses.push("enabled = ?");
    bindings.push(body.enabled ? 1 : 0);
  }

  if (body.name !== undefined) {
    setClauses.push("name = ?");
    bindings.push(body.name);
  }

  if (body.ats_slug !== undefined) {
    setClauses.push("ats_slug = ?");
    bindings.push(body.ats_slug);
  }

  if (body.ats_type !== undefined) {
    setClauses.push("ats_type = ?");
    bindings.push(body.ats_type);
  }

  if (body.website !== undefined) {
    setClauses.push("website = ?");
    bindings.push(body.website);
  }

  if (setClauses.length === 0) {
    return c.json({ error: "No fields to update" }, 400);
  }

  bindings.push(id);

  await c.env.DB.prepare(
    `UPDATE companies SET ${setClauses.join(", ")} WHERE id = ?`
  )
    .bind(...bindings)
    .run();

  const updated = await c.env.DB.prepare(
    "SELECT * FROM companies WHERE id = ?"
  )
    .bind(id)
    .first<CompanyRow>();

  if (!updated) {
    return c.json({ error: "Not found" }, 404);
  }

  return c.json(updated);
});

// POST /:id/poll — Trigger a poll for a single company
companies.post("/:id/poll", async (c) => {
  const { id } = c.req.param();
  const db = c.env.DB;

  const company = await db
    .prepare("SELECT * FROM companies WHERE id = ?")
    .bind(id)
    .first<CompanyRow>();

  if (!company) {
    return c.json({ error: "Not found" }, 404);
  }

  const prefs = await loadPreferencesForPoll(db);

  const now = new Date().toISOString();
  try {
    const newJobs = await pollCompany(company, db, prefs);
    await db
      .prepare("UPDATE companies SET last_poll_status = 'ok', last_poll_error = NULL, last_polled_at = ? WHERE id = ?")
      .bind(now, id)
      .run();

    const updated = await db.prepare("SELECT * FROM companies WHERE id = ?").bind(id).first<CompanyRow>();
    return c.json({ ...updated, new_jobs: newJobs.length });
  } catch (e: any) {
    const errMsg = e instanceof Error ? e.message : String(e);
    await db
      .prepare("UPDATE companies SET last_poll_status = 'error', last_poll_error = ?, last_polled_at = ? WHERE id = ?")
      .bind(errMsg, now, id)
      .run();

    const updated = await db.prepare("SELECT * FROM companies WHERE id = ?").bind(id).first<CompanyRow>();
    return c.json({ ...updated, poll_error: errMsg }, 200);
  }
});

// DELETE /:id — Delete company
companies.delete("/:id", async (c) => {
  const { id } = c.req.param();

  await c.env.DB.prepare("DELETE FROM companies WHERE id = ?")
    .bind(id)
    .run();

  return c.body(null, 204);
});

export default companies;
