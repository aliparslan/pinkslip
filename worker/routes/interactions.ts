import { Hono } from "hono";
import { requireAdmin } from "../auth";
import { validateFeedbackInput } from "../feedback";
import { recordProductEvent } from "../product-events";
import type { Env, Variables } from "../types";

const interactions = new Hono<{ Bindings: Env; Variables: Variables }>();

interactions.post("/companies/:id/block", async (c) => {
  const userId = c.get("userId");
  const companyId = c.req.param("id");
  const exists = await c.env.DB.prepare(
    "SELECT id FROM companies WHERE id = ? AND enabled = 1"
  ).bind(companyId).first<{ id: string }>();
  if (!exists) return c.json({ error: "Company not found" }, 404);

  await c.env.DB.prepare(
    `INSERT OR IGNORE INTO user_blocked_companies (user_id, company_id, blocked_at)
     VALUES (?, ?, ?)`
  ).bind(userId, companyId, new Date().toISOString()).run();
  await c.env.DB.prepare(
    `UPDATE notification_candidates
     SET status = 'skipped', last_error = 'Company hidden by user'
     WHERE user_id = ?
       AND status IN ('pending', 'retry')
       AND job_id IN (SELECT id FROM jobs WHERE company_id = ?)`
  ).bind(userId, companyId).run();
  await recordProductEvent(c.env.DB, {
    userId,
    sessionId: c.get("sessionId"),
    name: "company_blocked",
    entityType: "company",
    entityId: companyId,
  }).catch(() => undefined);
  return c.json({ blocked: true });
});

interactions.delete("/companies/:id/block", async (c) => {
  const userId = c.get("userId");
  const companyId = c.req.param("id");
  await c.env.DB.prepare(
    "DELETE FROM user_blocked_companies WHERE user_id = ? AND company_id = ?"
  ).bind(userId, companyId).run();
  await recordProductEvent(c.env.DB, {
    userId,
    sessionId: c.get("sessionId"),
    name: "company_restored",
    entityType: "company",
    entityId: companyId,
  }).catch(() => undefined);
  return c.json({ blocked: false });
});

interactions.post("/reports", async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json<{
    company_id?: string;
    job_id?: string;
    report_type?: string;
    notes?: string;
  }>();
  const allowedTypes = new Set([
    "broken_source",
    "expired_listing",
    "incorrect_details",
    "duplicate_listing",
    "other",
  ]);
  if (!body.report_type || !allowedTypes.has(body.report_type)) {
    return c.json({ error: "Choose a valid report reason" }, 400);
  }
  if (!body.company_id && !body.job_id) {
    return c.json({ error: "A company or job is required" }, 400);
  }

  let companyId = body.company_id ?? null;
  if (body.job_id) {
    const job = await c.env.DB.prepare(
      "SELECT company_id FROM jobs WHERE id = ?"
    ).bind(body.job_id).first<{ company_id: string }>();
    if (!job) return c.json({ error: "Job not found" }, 404);
    companyId = job.company_id;
  } else if (companyId) {
    const company = await c.env.DB.prepare(
      "SELECT id FROM companies WHERE id = ?"
    ).bind(companyId).first<{ id: string }>();
    if (!company) return c.json({ error: "Company not found" }, 404);
  }

  const id = crypto.randomUUID();
  await c.env.DB.prepare(
    `INSERT INTO content_reports (
       id, user_id, company_id, job_id, report_type, notes, status, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, 'open', ?)`
  ).bind(
    id,
    userId,
    companyId,
    body.job_id ?? null,
    body.report_type,
    body.notes?.trim().slice(0, 1000) ?? "",
    new Date().toISOString()
  ).run();
  await recordProductEvent(c.env.DB, {
    userId,
    sessionId: c.get("sessionId"),
    name: "content_reported",
    entityType: body.job_id ? "job" : "company",
    entityId: body.job_id ?? companyId,
    properties: { report_type: body.report_type },
  }).catch(() => undefined);
  return c.json({ id, status: "open" }, 201);
});

interactions.get("/reports", requireAdmin, async (c) => {
  const status = c.req.query("status") ?? "open";
  const result = await c.env.DB.prepare(
    `SELECT r.*, c.name AS company_name, j.title AS job_title
     FROM content_reports r
     LEFT JOIN companies c ON c.id = r.company_id
     LEFT JOIN jobs j ON j.id = r.job_id
     WHERE (? = 'all' OR r.status = ?)
     ORDER BY datetime(r.created_at) DESC
     LIMIT 200`
  ).bind(status, status).all();
  return c.json({ reports: result.results ?? [] });
});

interactions.patch("/reports/:id", requireAdmin, async (c) => {
  const body = await c.req.json<{ status?: string; admin_response?: string }>();
  const status = body.status ?? "resolved";
  if (!["open", "resolved", "dismissed"].includes(status)) {
    return c.json({ error: "Invalid report status" }, 400);
  }
  await c.env.DB.prepare(
    `UPDATE content_reports
     SET status = ?, admin_response = ?, resolved_at = CASE WHEN ? = 'open' THEN NULL ELSE ? END
     WHERE id = ?`
  ).bind(
    status,
    body.admin_response?.trim().slice(0, 1000) ?? null,
    status,
    new Date().toISOString(),
    c.req.param("id")
  ).run();
  return c.json({ ok: true });
});

interactions.post("/feedback", async (c) => {
  const body = await c.req.json<{
    submission_type?: string;
    title?: string;
    details?: string;
    careers_url?: string;
  }>().catch(() => ({}));
  const validation = validateFeedbackInput(body);
  if (!validation.ok) {
    return c.json({ error: validation.error }, 400);
  }

  const userId = c.get("userId");
  const feedback = validation.value;
  const existing = await c.env.DB.prepare(
    `SELECT *
     FROM feedback_submissions
     WHERE user_id = ?
       AND submission_type = ?
       AND lower(title) = lower(?)
       AND status IN ('new', 'planned')
     ORDER BY datetime(created_at) DESC
     LIMIT 1`
  ).bind(userId, feedback.submission_type, feedback.title).first();
  if (existing) {
    return c.json({ feedback: existing, duplicate: true });
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await c.env.DB.prepare(
    `INSERT INTO feedback_submissions (
       id, user_id, submission_type, title, details, careers_url,
       status, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, 'new', ?, ?)`
  ).bind(
    id,
    userId,
    feedback.submission_type,
    feedback.title,
    feedback.details,
    feedback.careers_url,
    now,
    now
  ).run();
  await recordProductEvent(c.env.DB, {
    userId,
    sessionId: c.get("sessionId"),
    name: "feedback_submitted",
    entityType: "feedback",
    entityId: id,
    properties: { feedback_type: feedback.submission_type },
  }).catch(() => undefined);

  return c.json({
    feedback: {
      id,
      user_id: userId,
      ...feedback,
      status: "new",
      admin_response: null,
      created_at: now,
      updated_at: now,
      resolved_at: null,
    },
    duplicate: false,
  }, 201);
});

interactions.get("/feedback", requireAdmin, async (c) => {
  const status = c.req.query("status") ?? "active";
  if (!["active", "new", "planned", "resolved", "declined", "all"].includes(status)) {
    return c.json({ error: "Invalid feedback status" }, 400);
  }

  const result = await c.env.DB.prepare(
    `SELECT f.*, u.name AS user_name
     FROM feedback_submissions f
     LEFT JOIN users u ON u.id = f.user_id
     WHERE (
       ? = 'all'
       OR (? = 'active' AND f.status IN ('new', 'planned'))
       OR f.status = ?
     )
     ORDER BY
       CASE f.status WHEN 'new' THEN 0 WHEN 'planned' THEN 1 ELSE 2 END,
       datetime(f.created_at) DESC
     LIMIT 200`
  ).bind(status, status, status).all();
  return c.json({ feedback: result.results ?? [] });
});

interactions.patch("/feedback/:id", requireAdmin, async (c) => {
  const body: { status?: string; admin_response?: string } = await c.req
    .json<{ status?: string; admin_response?: string }>()
    .catch(() => ({}));
  const status = body.status;
  if (!status || !["new", "planned", "resolved", "declined"].includes(status)) {
    return c.json({ error: "Invalid feedback status" }, 400);
  }

  const now = new Date().toISOString();
  const result = await c.env.DB.prepare(
    `UPDATE feedback_submissions
     SET status = ?,
         admin_response = ?,
         updated_at = ?,
         resolved_at = CASE WHEN ? IN ('resolved', 'declined') THEN ? ELSE NULL END
     WHERE id = ?`
  ).bind(
    status,
    body.admin_response?.trim().slice(0, 1000) ?? null,
    now,
    status,
    now,
    c.req.param("id")
  ).run();
  if (!result.meta.changes) {
    return c.json({ error: "Feedback not found" }, 404);
  }
  return c.json({ ok: true });
});

interactions.post("/events", async (c) => {
  const body = await c.req.json<{
    event_name?: string;
    entity_type?: string;
    entity_id?: string;
    properties?: Record<string, unknown>;
  }>();
  const allowedEvents = new Set([
    "onboarding_started",
    "onboarding_completed",
    "search_profile_adjusted",
    "job_displayed",
    "job_opened",
    "job_saved",
    "job_unsaved",
    "job_dismissed",
    "apply_clicked",
    "notification_opened",
    "tailoring_started",
    "tailoring_completed",
    "application_added",
  ]);
  if (!body.event_name || !allowedEvents.has(body.event_name)) {
    return c.json({ error: "Unsupported event" }, 400);
  }
  await recordProductEvent(c.env.DB, {
    userId: c.get("userId"),
    sessionId: c.get("sessionId"),
    name: body.event_name,
    entityType: body.entity_type,
    entityId: body.entity_id,
    properties: body.properties,
  });
  return c.body(null, 204);
});

export default interactions;
