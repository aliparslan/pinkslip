import { Hono } from "hono";
import type { Env, Variables, ApplicationRow } from "../types";
import { recordProductEvent } from "../product-events";

const applications = new Hono<{ Bindings: Env; Variables: Variables }>();

const ALLOWED_STAGES = new Set([
  "Applied", "Screen", "Interview", "Offer", "Rejected", "Ghosted",
]);

function cleanUrl(value: string | undefined): string {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return "";
  return /^https?:\/\//i.test(trimmed) ? trimmed.slice(0, 2000) : "";
}

// GET / — List applications for current user
applications.get("/", async (c) => {
  const userId = c.get("userId");
  const { stage } = c.req.query();

  let sql = `
    SELECT a.*, c.website AS company_domain
    FROM applications a
    LEFT JOIN jobs j ON a.job_id = j.id
    LEFT JOIN companies c ON j.company_id = c.id
    WHERE a.user_id = ?`;
  const bindings: string[] = [userId];

  if (stage) {
    sql += ` AND a.stage = ?`;
    bindings.push(stage);
  }

  sql += ` ORDER BY datetime(a.updated_at) DESC, a.updated_at DESC`;

  const result = await c.env.DB.prepare(sql)
    .bind(...bindings)
    .all<ApplicationRow & { company_domain?: string }>();

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

  const companyName = body.company_name?.trim();
  const title = body.title?.trim();
  if (!companyName || !title) {
    return c.json({ error: "company_name and title are required", code: "invalid_application" }, 400);
  }
  const stage = body.stage ?? "Applied";
  if (!ALLOWED_STAGES.has(stage)) {
    return c.json({ error: "Invalid stage", code: "invalid_application" }, 400);
  }

  const url = cleanUrl(body.url);
  if (body.url?.trim() && !url) {
    return c.json({ error: "Application URLs must start with http:// or https://", code: "invalid_application" }, 400);
  }
  if (body.job_id) {
    const job = await c.env.DB.prepare("SELECT id FROM jobs WHERE id = ?")
      .bind(body.job_id)
      .first<{ id: string }>();
    if (!job) return c.json({ error: "Job not found", code: "invalid_application" }, 404);
  }

  const loadExisting = () =>
    c.env.DB.prepare(`SELECT * FROM applications WHERE user_id = ? AND job_id = ?`)
      .bind(userId, body.job_id).first<ApplicationRow>();

  if (body.job_id) {
    const existing = await loadExisting();
    if (existing) return c.json(existing, 200);
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  try {
    await c.env.DB.prepare(
      `INSERT INTO applications (id, user_id, job_id, company_name, title, stage, next, url, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        id,
        userId,
        body.job_id ?? null,
        companyName.slice(0, 200),
        title.slice(0, 300),
        stage,
        (body.next ?? "").slice(0, 2000),
        url,
        now,
        now
      )
      .run();
  } catch (error) {
    // A concurrent create for the same job lost the race on the unique index —
    // return the row the other request committed instead of failing.
    if (body.job_id) {
      const existing = await loadExisting();
      if (existing) return c.json(existing, 200);
    }
    throw error;
  }

  const row = await c.env.DB.prepare(`SELECT * FROM applications WHERE id = ?`)
    .bind(id)
    .first<ApplicationRow>();

  await recordProductEvent(c.env.DB, {
    userId,
    sessionId: c.get("sessionId"),
    name: "application_added",
    entityType: body.job_id ? "job" : "application",
    entityId: body.job_id ?? id,
    properties: { source: body.job_id ? "job_detail" : "tracker" },
  }).catch(() => undefined);

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

  if (body.stage !== undefined && !ALLOWED_STAGES.has(body.stage)) {
    return c.json({ error: "Invalid stage", code: "invalid_application" }, 400);
  }
  if (body.url !== undefined && body.url.trim() && !cleanUrl(body.url)) {
    return c.json({ error: "Application URLs must start with http:// or https://", code: "invalid_application" }, 400);
  }

  const now = new Date().toISOString();
  const setClauses: string[] = ["updated_at = ?"];
  const bindings: (string | number)[] = [now];

  if (body.company_name !== undefined) {
    setClauses.push("company_name = ?");
    bindings.push((body.company_name.trim() || "Untitled").slice(0, 200));
  }
  if (body.title !== undefined) {
    setClauses.push("title = ?");
    bindings.push((body.title.trim() || "Untitled").slice(0, 300));
  }
  if (body.stage !== undefined) {
    setClauses.push("stage = ?");
    bindings.push(body.stage);
  }
  if (body.next !== undefined) {
    setClauses.push("next = ?");
    bindings.push(body.next.slice(0, 2000));
  }
  if (body.url !== undefined) {
    setClauses.push("url = ?");
    bindings.push(cleanUrl(body.url));
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
