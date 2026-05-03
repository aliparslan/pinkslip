import { Hono } from "hono";
import type { Env, CompanyRow } from "../types";

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

  return c.json(result.results ?? []);
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
    ats_slug?: string;
    ats_type?: CompanyRow["ats_type"];
  }>();

  const setClauses: string[] = [];
  const bindings: (string | number)[] = [];

  if (body.enabled !== undefined) {
    setClauses.push("enabled = ?");
    bindings.push(body.enabled ? 1 : 0);
  }

  if (body.ats_slug !== undefined) {
    setClauses.push("ats_slug = ?");
    bindings.push(body.ats_slug);
  }

  if (body.ats_type !== undefined) {
    setClauses.push("ats_type = ?");
    bindings.push(body.ats_type);
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

// DELETE /:id — Delete company
companies.delete("/:id", async (c) => {
  const { id } = c.req.param();

  await c.env.DB.prepare("DELETE FROM companies WHERE id = ?")
    .bind(id)
    .run();

  return c.body(null, 204);
});

export default companies;
