import { Hono } from "hono";
import type { Env, EventRow, Variables } from "../types";

const events = new Hono<{ Bindings: Env; Variables: Variables }>();

const EVENT_TYPES = new Set([
  "call",
  "screen",
  "onsite",
  "take-home",
  "offer",
  "other",
]);

function cleanEventUrl(value: string | undefined): string {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return "";
  return /^https?:\/\//i.test(trimmed) ? trimmed.slice(0, 1000) : "";
}

// GET / — List the current user's events
events.get("/", async (c) => {
  const userId = c.get("userId");
  const { company_id, upcoming } = c.req.query();

  const conditions: string[] = ["e.user_id = ?"];
  const bindings: (string | number)[] = [userId];

  if (company_id) {
    conditions.push("e.company_id = ?");
    bindings.push(company_id);
  }

  if (upcoming === "true") {
    conditions.push("e.event_date >= datetime('now')");
  }

  const where = `WHERE ${conditions.join(" AND ")}`;

  const result = await c.env.DB.prepare(
    `SELECT e.*, COALESCE(c.name, NULLIF(e.company_name, '')) AS company_name
     FROM events e
     LEFT JOIN companies c ON e.company_id = c.id
     ${where}
     ORDER BY e.event_date ASC`
  )
    .bind(...bindings)
    .all<EventRow & { company_name: string | null }>();

  return c.json({ events: result.results ?? [] });
});

// POST / — Create an event owned by the current user
events.post("/", async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json<{
    company_id?: string;
    company_name?: string;
    title?: string;
    description?: string;
    event_type?: string;
    event_date?: string;
    location?: string;
    url?: string;
  }>().catch(() => null);

  const title = body?.title?.trim();
  const eventDate = body?.event_date?.trim();
  if (!title || !eventDate) {
    return c.json({ error: "title and event_date are required", code: "invalid_event" }, 400);
  }
  if (!Number.isFinite(Date.parse(eventDate))) {
    return c.json({ error: "Enter a valid event date", code: "invalid_event" }, 400);
  }
  const eventType = body?.event_type && EVENT_TYPES.has(body.event_type) ? body.event_type : "other";
  if (body?.url?.trim() && !cleanEventUrl(body.url)) {
    return c.json({ error: "Event links must start with http:// or https://", code: "invalid_event" }, 400);
  }
  if (body?.company_id) {
    const company = await c.env.DB.prepare("SELECT id FROM companies WHERE id = ?")
      .bind(body.company_id)
      .first<{ id: string }>();
    if (!company) return c.json({ error: "Company not found", code: "invalid_event" }, 400);
  }

  const id = crypto.randomUUID();

  await c.env.DB.prepare(
    `INSERT INTO events (id, user_id, company_id, company_name, title, description, event_type, event_date, location, url)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      id,
      userId,
      body?.company_id ?? null,
      (body?.company_name ?? "").slice(0, 200),
      title.slice(0, 300),
      (body?.description ?? "").slice(0, 2000),
      eventType,
      eventDate,
      (body?.location ?? "").slice(0, 300),
      cleanEventUrl(body?.url)
    )
    .run();

  const row = await c.env.DB.prepare(
    `SELECT e.*, COALESCE(c.name, NULLIF(e.company_name, '')) AS company_name
     FROM events e
     LEFT JOIN companies c ON e.company_id = c.id
     WHERE e.id = ? AND e.user_id = ?`
  )
    .bind(id, userId)
    .first<EventRow & { company_name: string | null }>();

  return c.json(row, 201);
});

// DELETE /:id — Delete one of the current user's events
events.delete("/:id", async (c) => {
  const userId = c.get("userId");
  const { id } = c.req.param();
  await c.env.DB.prepare(`DELETE FROM events WHERE id = ? AND user_id = ?`)
    .bind(id, userId)
    .run();
  return c.json({ ok: true });
});

export default events;
