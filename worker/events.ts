// Company events (docs/backend-inventory-2026-10-16.md, step 7; Decisions:
// Following and events): info sessions and fairs added in Admin from a pasted
// link. Shown on the company's page for everyone, in Today's Coming up at a
// company you've saved or applied to (following is parked until outreach and
// auto-apply; owner, 2026-10-19) or when you asked to be reminded, and gone
// from the page the day after. Remind me (N19) is a push the day before.

import type { CompanyEvent } from "../shared/company-events";
import { notifyActivity, recordActivity } from "./activity";
import { DEFAULT_TIME_ZONE, localParts, validTimeZone, zonedTime } from "./local-time";
import { notificationLinks } from "./notification-kinds";
import type { Env } from "./types";

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

export interface CompanyEventRow {
  id: string;
  company_id: string;
  title: string;
  starts_at: string;
  ends_at: string | null;
  location: string;
  online: number;
  url: string;
  signup_closes_at: string | null;
  audience: string;
  host: string;
  about: string;
  points_json: string;
  created_at: string;
  updated_at: string;
}

type EventWithCompany = CompanyEventRow & { company_name: string; company_domain: string | null; reminded?: number };

export const EVENT_FIELDS = `e.id, e.company_id, e.title, e.starts_at, e.ends_at, e.location, e.online, e.url,
  e.signup_closes_at, e.audience, e.host, e.about, e.points_json, e.created_at, e.updated_at,
  c.name AS company_name, c.website AS company_domain`;

function points(json: string): string[] {
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed.filter((point): point is string => typeof point === "string") : [];
  } catch {
    return [];
  }
}

export function serializeEvent(row: EventWithCompany): CompanyEvent {
  return {
    id: row.id,
    company_id: row.company_id,
    company_name: row.company_name,
    company_domain: row.company_domain ?? "",
    title: row.title,
    starts_at: row.starts_at,
    ends_at: row.ends_at,
    location: row.location,
    online: row.online === 1,
    url: row.url,
    signup_closes_at: row.signup_closes_at,
    audience: row.audience,
    host: row.host,
    about: row.about,
    points: points(row.points_json),
    reminded: row.reminded === 1,
  };
}

/** The start of the day after the event, where the person is: when it leaves the company's page. */
export function eventLeavesAt(event: Pick<CompanyEventRow, "starts_at" | "ends_at">, zone: string): number {
  const last = localParts(new Date(event.ends_at ?? event.starts_at), zone);
  return zonedTime(last.year, last.month, last.day + 1, 0, zone).getTime();
}

async function userZone(db: D1Database, userId: string): Promise<string> {
  const row = await db.prepare("SELECT time_zone FROM users WHERE id = ?").bind(userId).first<{ time_zone: string | null }>();
  return validTimeZone(row?.time_zone, DEFAULT_TIME_ZONE);
}

/** A company's events still on its page, soonest first. */
export async function listCompanyEvents(db: D1Database, companyId: string, userId: string, now = new Date()): Promise<CompanyEvent[]> {
  const zone = await userZone(db, userId);
  // Two days back covers every time zone's "today"; the exact cut is per person.
  const rows = await db.prepare(
    `SELECT ${EVENT_FIELDS},
            CAST(EXISTS(SELECT 1 FROM event_reminders r WHERE r.user_id = ? AND r.event_id = e.id) AS INTEGER) AS reminded
     FROM company_events e JOIN companies c ON c.id = e.company_id
     WHERE e.company_id = ? AND COALESCE(e.ends_at, e.starts_at) > ?
     ORDER BY e.starts_at ASC
     LIMIT 50`
  ).bind(userId, companyId, new Date(now.getTime() - 2 * DAY_MS).toISOString()).all<EventWithCompany>();
  return (rows.results ?? []).filter((row) => now.getTime() < eventLeavesAt(row, zone)).map(serializeEvent);
}

export async function getEvent(db: D1Database, eventId: string, userId: string): Promise<CompanyEvent | null> {
  const row = await db.prepare(
    `SELECT ${EVENT_FIELDS},
            CAST(EXISTS(SELECT 1 FROM event_reminders r WHERE r.user_id = ? AND r.event_id = e.id) AS INTEGER) AS reminded
     FROM company_events e JOIN companies c ON c.id = e.company_id
     WHERE e.id = ?`
  ).bind(userId, eventId).first<EventWithCompany>();
  return row ? serializeEvent(row) : null;
}

/**
 * Coming up's events, from the start of today through the horizon: the ones
 * at companies the person has saved or applied to (any application, with or
 * without a Pinkslip job), and the ones they asked to be reminded of. That
 * interest is already known, so there's nothing to follow (owner, 2026-10-19).
 */
export async function comingUpEvents(db: D1Database, userId: string, from: number, until: number): Promise<CompanyEvent[]> {
  const rows = await db.prepare(
    `SELECT ${EVENT_FIELDS},
            CAST(EXISTS(SELECT 1 FROM event_reminders r WHERE r.user_id = ? AND r.event_id = e.id) AS INTEGER) AS reminded
     FROM company_events e JOIN companies c ON c.id = e.company_id
     WHERE e.starts_at >= ? AND e.starts_at < ?
       AND (EXISTS (
              SELECT 1 FROM applications a LEFT JOIN jobs j ON j.id = a.job_id
              WHERE a.user_id = ? AND (j.company_id = e.company_id OR (a.job_id IS NULL AND lower(a.company_name) = lower(c.name))))
         OR EXISTS (SELECT 1 FROM event_reminders r WHERE r.user_id = ? AND r.event_id = e.id))
     ORDER BY e.starts_at ASC
     LIMIT 20`
  ).bind(userId, new Date(from).toISOString(), new Date(until).toISOString(), userId, userId).all<EventWithCompany>();
  return (rows.results ?? []).map(serializeEvent);
}

function clock(moment: Date, zone: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: zone, hour: "numeric", minute: "2-digit" }).format(moment);
}

/**
 * N19, the day before: at 6 pm where the person is (as an interview's
 * evening-before reminder), until 10 pm or the event's start.
 */
export function plannedEventReminder(event: { id: string; title: string; starts_at: string; company_name: string }, zone: string) {
  const start = new Date(event.starts_at);
  const local = localParts(start, zone);
  const at = zonedTime(local.year, local.month, local.day - 1, 18, zone);
  return {
    at,
    until: new Date(Math.min(at.getTime() + 4 * HOUR_MS, start.getTime())),
    title: `${event.company_name} tomorrow at ${clock(start, zone)}`,
    body: event.title,
    url: notificationLinks.event(event.id),
    dedupeKey: `event_reminder:${event.id}:${event.starts_at}`,
  };
}

/**
 * Runs on the every-minute tick: each reminder that has come due goes into the
 * Activity stream once (by its key, so a moved event reminds again) and its
 * push starts there. Nothing is stored ahead of time.
 */
export async function queueDueEventReminders(env: Env, now = new Date()): Promise<number> {
  const rows = await env.DB.prepare(
    `SELECT r.user_id, e.id, e.title, e.starts_at, c.name AS company_name, u.time_zone
     FROM event_reminders r
     JOIN company_events e ON e.id = r.event_id
     JOIN companies c ON c.id = e.company_id
     JOIN users u ON u.id = r.user_id
     WHERE e.starts_at > ? AND e.starts_at < ?
     LIMIT 5000`
  ).bind(now.toISOString(), new Date(now.getTime() + 2 * DAY_MS).toISOString())
    .all<{ user_id: string; id: string; title: string; starts_at: string; company_name: string; time_zone: string | null }>();
  let queued = 0;
  for (const row of rows.results ?? []) {
    const reminder = plannedEventReminder(row, validTimeZone(row.time_zone, DEFAULT_TIME_ZONE));
    if (reminder.at > now || reminder.until <= now) continue;
    const activity = await recordActivity(env.DB, {
      userId: row.user_id,
      kind: "reminder_due",
      source: "system",
      detail: {
        type: "event_day_before",
        notification_kind: "event_reminder",
        title: reminder.title,
        body: reminder.body,
        url: reminder.url,
        time_sensitive: false,
        dedupe_key: reminder.dedupeKey,
        entity_type: "company_event",
        entity_id: row.id,
      },
      occurredAt: now,
      dedupeKey: reminder.dedupeKey,
    }, now);
    if (activity && await notifyActivity(env.DB, activity, now)) queued += 1;
  }
  return queued;
}
