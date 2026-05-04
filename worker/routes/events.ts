import { Hono } from "hono";
import type { Env, EventRow } from "../types";

const events = new Hono<{ Bindings: Env }>();

// GET / — List events
events.get("/", async (c) => {
  const { company_id, upcoming } = c.req.query();

  const conditions: string[] = [];
  const bindings: (string | number)[] = [];

  if (company_id) {
    conditions.push("e.company_id = ?");
    bindings.push(company_id);
  }

  if (upcoming === "true") {
    conditions.push("e.event_date >= datetime('now')");
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const result = await c.env.DB.prepare(
    `SELECT e.*, c.name AS company_name
     FROM events e
     LEFT JOIN companies c ON e.company_id = c.id
     ${where}
     ORDER BY e.event_date ASC`
  )
    .bind(...bindings)
    .all<EventRow & { company_name: string | null }>();

  return c.json({ events: result.results ?? [] });
});

// POST / — Create event
events.post("/", async (c) => {
  const body = await c.req.json<{
    company_id?: string;
    title: string;
    description?: string;
    event_type?: string;
    event_date: string;
    location?: string;
    url?: string;
  }>();

  const id = crypto.randomUUID();

  await c.env.DB.prepare(
    `INSERT INTO events (id, company_id, title, description, event_type, event_date, location, url)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      id,
      body.company_id ?? null,
      body.title,
      body.description ?? "",
      body.event_type ?? "other",
      body.event_date,
      body.location ?? "",
      body.url ?? ""
    )
    .run();

  const row = await c.env.DB.prepare(
    `SELECT e.*, c.name AS company_name
     FROM events e
     LEFT JOIN companies c ON e.company_id = c.id
     WHERE e.id = ?`
  )
    .bind(id)
    .first<EventRow & { company_name: string | null }>();

  return c.json(row, 201);
});

// DELETE /:id — Delete event
events.delete("/:id", async (c) => {
  const { id } = c.req.param();
  await c.env.DB.prepare(`DELETE FROM events WHERE id = ?`).bind(id).run();
  return c.json({ ok: true });
});

export default events;
