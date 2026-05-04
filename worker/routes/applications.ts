import { Hono } from "hono";
import type { Env, Variables, ApplicationRow } from "../types";

const applications = new Hono<{ Bindings: Env; Variables: Variables }>();

// GET / — List applications for current user
applications.get("/", async (c) => {
  const userId = c.get("userId");
  const { stage } = c.req.query();

  let sql = `SELECT * FROM applications WHERE user_id = ?`;
  const bindings: string[] = [userId];

  if (stage) {
    sql += ` AND stage = ?`;
    bindings.push(stage);
  }

  sql += ` ORDER BY datetime(updated_at) DESC, updated_at DESC`;

  const result = await c.env.DB.prepare(sql)
    .bind(...bindings)
    .all<ApplicationRow>();

  return c.json({ applications: result.results ?? [] });
});

// POST / — Create application for current user (idempotent per job_id)
applications.post("/", async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json<{
    job_id?: string;
    company_name: string;
    title: string;
    stage?: string;
    next?: string;
    url?: string;
  }>();

  if (body.job_id) {
    const existing = await c.env.DB.prepare(
      `SELECT * FROM applications WHERE user_id = ? AND job_id = ?`
    ).bind(userId, body.job_id).first<ApplicationRow>();
    if (existing) return c.json(existing, 200);
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await c.env.DB.prepare(
    `INSERT INTO applications (id, user_id, job_id, company_name, title, stage, next, url, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      id,
      userId,
      body.job_id ?? null,
      body.company_name,
      body.title,
      body.stage ?? "Applied",
      body.next ?? "",
      body.url ?? "",
      now,
      now
    )
    .run();

  const row = await c.env.DB.prepare(`SELECT * FROM applications WHERE id = ?`)
    .bind(id)
    .first<ApplicationRow>();

  return c.json(row, 201);
});

// PATCH /:id — Update application (scoped to user)
applications.patch("/:id", async (c) => {
  const userId = c.get("userId");
  const { id } = c.req.param();
  const body = await c.req.json<{
    company_name?: string;
    title?: string;
    stage?: string;
    next?: string;
    url?: string;
  }>();

  const now = new Date().toISOString();
  const setClauses: string[] = ["updated_at = ?"];
  const bindings: (string | number)[] = [now];

  if (body.company_name !== undefined) {
    setClauses.push("company_name = ?");
    bindings.push(body.company_name);
  }
  if (body.title !== undefined) {
    setClauses.push("title = ?");
    bindings.push(body.title);
  }
  if (body.stage !== undefined) {
    setClauses.push("stage = ?");
    bindings.push(body.stage);
  }
  if (body.next !== undefined) {
    setClauses.push("next = ?");
    bindings.push(body.next);
  }
  if (body.url !== undefined) {
    setClauses.push("url = ?");
    bindings.push(body.url);
  }

  bindings.push(id, userId);

  await c.env.DB.prepare(
    `UPDATE applications SET ${setClauses.join(", ")} WHERE id = ? AND user_id = ?`
  )
    .bind(...bindings)
    .run();

  const updated = await c.env.DB.prepare(`SELECT * FROM applications WHERE id = ? AND user_id = ?`)
    .bind(id, userId)
    .first<ApplicationRow>();

  if (!updated) return c.json({ error: "Not found" }, 404);
  return c.json(updated);
});

// DELETE /:id — Delete application (scoped to user)
applications.delete("/:id", async (c) => {
  const userId = c.get("userId");
  const { id } = c.req.param();
  await c.env.DB.prepare(`DELETE FROM applications WHERE id = ? AND user_id = ?`)
    .bind(id, userId).run();
  return c.json({ ok: true });
});

export default applications;
