import { Hono } from "hono";
import { requireAdmin } from "../auth";
import { importEvent, matchEventCompany } from "../event-import";
import { EVENT_FIELDS, getEvent, serializeEvent, type CompanyEventRow } from "../events";
import { recordProductEvent } from "../product-events";
import type { Env, Variables } from "../types";

/**
 * Company events (Decisions: Following and events): an event's page and its
 * Remind me for everyone; adding, editing and removing them for the admin,
 * starting from a pasted link. A company's events are at
 * GET /companies/:id/events.
 */
const events = new Hono<{ Bindings: Env; Variables: Variables }>();

interface EventInput {
  company_id?: unknown;
  title?: unknown;
  starts_at?: unknown;
  ends_at?: unknown;
  location?: unknown;
  online?: unknown;
  url?: unknown;
  signup_closes_at?: unknown;
  audience?: unknown;
  host?: unknown;
  about?: unknown;
  points?: unknown;
}

const isUrl = (value: unknown): value is string => {
  if (typeof value !== "string" || value.length > 2000) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
};

function optionalInstant(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  if (typeof value !== "string") return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

const short = (value: unknown, max: number) => (typeof value === "string" ? value.trim().slice(0, max) : "");

/** The admin's fields, checked; `partial` for an edit. */
function readEventInput(body: EventInput, partial: boolean): { fields: Record<string, string | number | null>; error?: string } {
  const fields: Record<string, string | number | null> = {};
  if (!partial || body.company_id !== undefined) {
    if (typeof body.company_id !== "string" || !body.company_id) return { fields, error: "Pick the company" };
    fields.company_id = body.company_id;
  }
  if (!partial || body.title !== undefined) {
    const title = short(body.title, 160);
    if (!title) return { fields, error: "Add a title" };
    fields.title = title;
  }
  if (!partial || body.starts_at !== undefined) {
    const startsAt = optionalInstant(body.starts_at);
    if (!startsAt) return { fields, error: "Add when it starts" };
    fields.starts_at = startsAt;
  }
  if (!partial || body.url !== undefined) {
    if (!isUrl(body.url)) return { fields, error: "Add the event's link" };
    fields.url = body.url;
  }
  for (const key of ["ends_at", "signup_closes_at"] as const) {
    const value = optionalInstant(body[key]);
    if (body[key] !== undefined && value === undefined) return { fields, error: "That date doesn't read as a date" };
    if (value !== undefined) fields[key] = value;
  }
  for (const [key, max] of [["location", 160], ["audience", 80], ["host", 120], ["about", 1200]] as const) {
    if (!partial || body[key] !== undefined) fields[key] = short(body[key], max);
  }
  if (!partial || body.online !== undefined) fields.online = body.online === true ? 1 : 0;
  if (!partial || body.points !== undefined) {
    const points = Array.isArray(body.points)
      ? body.points.filter((point): point is string => typeof point === "string").map((point) => point.trim().slice(0, 160)).filter(Boolean).slice(0, 6)
      : [];
    fields.points_json = JSON.stringify(points);
  }
  if (typeof fields.ends_at === "string" && typeof fields.starts_at === "string" && fields.ends_at < fields.starts_at) {
    return { fields, error: "It ends before it starts" };
  }
  return { fields };
}

async function eventForAdmin(db: D1Database, id: string) {
  const row = await db.prepare(
    `SELECT ${EVENT_FIELDS},
            (SELECT COUNT(*) FROM event_reminders r WHERE r.event_id = e.id) AS reminders
     FROM company_events e JOIN companies c ON c.id = e.company_id WHERE e.id = ?`
  ).bind(id).first<CompanyEventRow & { company_name: string; company_domain: string | null; reminders: number }>();
  return row ? { ...serializeEvent(row), reminders: row.reminders } : null;
}

// ─── Admin ───────────────────────────────────────────────────────────────────

/** Upcoming events and the last two weeks', with how many asked to be reminded. */
events.get("/", requireAdmin, async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT ${EVENT_FIELDS},
            (SELECT COUNT(*) FROM event_reminders r WHERE r.event_id = e.id) AS reminders
     FROM company_events e JOIN companies c ON c.id = e.company_id
     WHERE e.starts_at > ?
     ORDER BY e.starts_at ASC
     LIMIT 200`
  ).bind(new Date(Date.now() - 14 * 86_400_000).toISOString())
    .all<CompanyEventRow & { company_name: string; company_domain: string | null; reminders: number }>();
  return c.json({ events: (rows.results ?? []).map((row) => ({ ...serializeEvent(row), reminders: row.reminders })) });
});

/** Paste a link: Pinkslip reads the page and fills in what it can, to check before saving. */
events.post("/preview", requireAdmin, async (c) => {
  const body = await c.req.json<{ url?: unknown }>().catch(() => null);
  if (!isUrl(body?.url)) return c.json({ error: "Paste the event's link" }, 400);
  try {
    const draft = await importEvent(c.env, body.url);
    return c.json({ draft, company: await matchEventCompany(c.env.DB, draft) });
  } catch (error) {
    return c.json({ error: `Couldn't read that page: ${error instanceof Error ? error.message : "it didn't load"}` }, 502);
  }
});

events.post("/", requireAdmin, async (c) => {
  const body = await c.req.json<EventInput>().catch(() => null);
  const { fields, error } = readEventInput(body ?? {}, false);
  if (error) return c.json({ error }, 400);
  const company = await c.env.DB.prepare("SELECT id FROM companies WHERE id = ?").bind(fields.company_id).first();
  if (!company) return c.json({ error: "That company isn't in Pinkslip" }, 400);
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await c.env.DB.prepare(
    `INSERT INTO company_events (id, company_id, title, starts_at, ends_at, location, online, url, signup_closes_at,
       audience, host, about, points_json, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(id, fields.company_id, fields.title, fields.starts_at, fields.ends_at ?? null, fields.location, fields.online, fields.url,
    fields.signup_closes_at ?? null, fields.audience, fields.host, fields.about, fields.points_json, c.get("userId"), now, now).run();
  return c.json(await eventForAdmin(c.env.DB, id), 201);
});

events.patch("/:id", requireAdmin, async (c) => {
  const body = await c.req.json<EventInput>().catch(() => null);
  const { fields, error } = readEventInput(body ?? {}, true);
  if (error) return c.json({ error }, 400);
  const keys = Object.keys(fields);
  if (keys.length > 0) {
    const result = await c.env.DB.prepare(
      `UPDATE company_events SET ${keys.map((key) => `${key} = ?`).join(", ")}, updated_at = ? WHERE id = ?`
    ).bind(...keys.map((key) => fields[key] ?? null), new Date().toISOString(), c.req.param("id")).run();
    if ((result.meta.changes ?? 0) === 0) return c.json({ error: "Event not found" }, 404);
  }
  const event = await eventForAdmin(c.env.DB, c.req.param("id"));
  return event ? c.json(event) : c.json({ error: "Event not found" }, 404);
});

events.delete("/:id", requireAdmin, async (c) => {
  await c.env.DB.prepare("DELETE FROM company_events WHERE id = ?").bind(c.req.param("id")).run();
  return c.body(null, 204);
});

// ─── Everyone ────────────────────────────────────────────────────────────────

events.get("/:id", async (c) => {
  const event = await getEvent(c.env.DB, c.req.param("id"), c.get("userId"));
  return event ? c.json(event) : c.json({ error: "Event not found" }, 404);
});

/** Remind me (N19): a push the day before. */
events.put("/:id/reminder", async (c) => {
  const userId = c.get("userId");
  const eventId = c.req.param("id");
  const event = await c.env.DB.prepare("SELECT id, starts_at FROM company_events WHERE id = ?")
    .bind(eventId).first<{ id: string; starts_at: string }>();
  if (!event) return c.json({ error: "Event not found" }, 404);
  if (Date.parse(event.starts_at) <= Date.now()) return c.json({ error: "That event has started" }, 409);
  await c.env.DB.prepare("INSERT OR IGNORE INTO event_reminders (user_id, event_id, created_at) VALUES (?, ?, ?)")
    .bind(userId, eventId, new Date().toISOString()).run();
  await recordProductEvent(c.env.DB, {
    userId,
    sessionId: c.get("sessionId"),
    name: "event_reminder_set",
    entityType: "company_event",
    entityId: eventId,
  }).catch(() => undefined);
  return c.json({ reminded: true });
});

events.delete("/:id/reminder", async (c) => {
  await c.env.DB.prepare("DELETE FROM event_reminders WHERE user_id = ? AND event_id = ?")
    .bind(c.get("userId"), c.req.param("id")).run();
  return c.json({ reminded: false });
});

export default events;
