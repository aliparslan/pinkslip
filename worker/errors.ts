// Our own error reporting, without an outside service
// (docs/backend-inventory-2026-10-16.md, Decisions: Admin #1). Each error is
// one row per kind and place with a count, so a fault that fires a thousand
// times is still one row, and a new row is what pages an admin.

import { notifyAdmins } from "./admin-alerts";
import type { NotificationPayload } from "./push";
import type { Env } from "./types";

export type ErrorSource = "api" | "cron" | "queue" | "email" | "ios" | "web";

export interface ErrorReport {
  source: ErrorSource;
  /** The error's class name: TypeError, D1Error, … */
  name?: string | null;
  message: string;
  /** A Hono route pattern ("GET /api/v2/jobs/:id"), a cycle or queue, or an app screen. */
  route: string;
  stack?: string | null;
  requestId?: string | null;
  build?: string | null;
}

export interface ErrorRow {
  id: string;
  source: ErrorSource;
  kind: string;
  route: string;
  message: string;
  stack: string | null;
  count: number;
  first_seen_at: string;
  last_seen_at: string;
  last_request_id: string | null;
  last_build: string | null;
  alerted_at: string | null;
}

const MAX_KIND = 200;
const MAX_MESSAGE = 500;
const MAX_STACK = 4000;
const MAX_ROUTE = 120;
const MAX_BUILD = 40;

const UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;

/** Emails and links can carry personal details; neither helps group a fault. */
function scrub(text: string): string {
  return text
    .replace(/[^\s@<>()"']+@[^\s@<>()"']+\.[a-z]{2,}/gi, "<email>")
    .replace(/\b(?:https?|capacitor|pinkslip):\/\/[^\s)"'<>]+/gi, "<url>");
}

/**
 * The same fault reads the same however often it fires: ids, hex and token
 * runs, and standalone numbers become placeholders. Words that only contain
 * a digit ("D1_ERROR") stay as they are.
 */
export function errorKind(name: string | null | undefined, message: string): string {
  const cleaned = scrub(message)
    .replace(UUID, "<id>")
    .replace(/\b(?=[0-9a-f]*\d)(?=[0-9a-f]*[a-f])[0-9a-f]{8,}\b/gi, "<id>")
    .replace(/\b(?=[\w-]*\d)[\w-]{16,}\b/g, "<id>")
    .replace(/\b\d+(?:\.\d+)?\b/g, "<n>")
    .replace(/\s+/g, " ")
    .trim();
  const label = name?.trim() || "Error";
  return (cleaned ? `${label}: ${cleaned}` : label).slice(0, MAX_KIND);
}

function looksLikeId(segment: string): boolean {
  return new RegExp(`^${UUID.source}$`, "i").test(segment)
    || (segment.length >= 6 && /\d/.test(segment))
    || segment.length >= 24;
}

/** Ids in a path become ":id" so one screen or endpoint stays one route. */
export function normalizeRoute(route: string): string {
  const path = route.split(/[?#]/)[0]!.trim();
  const normalized = path
    .split("/")
    .map((segment) => segment && !segment.startsWith(":") && looksLikeId(segment) ? ":id" : segment)
    .join("/");
  return (normalized || "/").slice(0, MAX_ROUTE);
}

/**
 * Adds one occurrence. Never throws: reporting an error must not become a
 * second failure on the request, cron or queue that hit the first.
 *
 * `allowNew: false` only counts kinds already on file (used to bound what
 * unauthenticated app reports can add).
 */
export async function recordError(
  db: D1Database,
  report: ErrorReport,
  options: { now?: Date; allowNew?: boolean } = {}
): Promise<boolean> {
  try {
    const at = (options.now ?? new Date()).toISOString();
    const kind = errorKind(report.name, report.message);
    const route = normalizeRoute(report.route);
    const message = scrub(report.message || report.name || "Error").slice(0, MAX_MESSAGE);
    const stack = report.stack ? scrub(report.stack).slice(0, MAX_STACK) : null;
    const requestId = report.requestId?.slice(0, 64) ?? null;
    const build = report.build?.slice(0, MAX_BUILD) ?? null;

    if (options.allowNew === false) {
      const result = await db.prepare(
        `UPDATE errors
         SET count = count + 1, message = ?, stack = COALESCE(?, stack), last_seen_at = ?,
             last_build = COALESCE(?, last_build)
         WHERE source = ? AND kind = ? AND route = ?`
      ).bind(message, stack, at, build, report.source, kind, route).run();
      return (result.meta?.changes ?? 0) > 0;
    }

    await db.prepare(
      `INSERT INTO errors (
         id, source, kind, route, message, stack, count, first_seen_at, last_seen_at,
         last_request_id, last_build
       ) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)
       ON CONFLICT (source, kind, route) DO UPDATE SET
         count = errors.count + 1,
         message = excluded.message,
         stack = COALESCE(excluded.stack, errors.stack),
         last_seen_at = excluded.last_seen_at,
         last_request_id = COALESCE(excluded.last_request_id, errors.last_request_id),
         last_build = COALESCE(excluded.last_build, errors.last_build)`
    ).bind(
      crypto.randomUUID(),
      report.source,
      kind,
      route,
      message,
      stack,
      at,
      at,
      requestId,
      build
    ).run();
    return true;
  } catch (error) {
    console.error("Could not record error:", error instanceof Error ? error.message : String(error));
    return false;
  }
}

/** The fields of a thrown value, whatever was thrown. */
export function describeThrown(error: unknown): { name: string; message: string; stack: string | null } {
  if (error instanceof Error) {
    return { name: error.name || "Error", message: error.message, stack: error.stack ?? null };
  }
  return { name: "Error", message: typeof error === "string" ? error : JSON.stringify(error) ?? String(error), stack: null };
}

const SOURCE_LABEL: Record<ErrorSource, string> = {
  api: "the API",
  cron: "a cron",
  queue: "a queue",
  email: "inbound mail",
  ios: "the iPhone app",
  web: "the web app",
};

const SOURCE_SHORT: Record<ErrorSource, string> = {
  api: "API",
  cron: "cron",
  queue: "queue",
  email: "mail",
  ios: "iPhone",
  web: "web",
};

type NewError = Pick<ErrorRow, "source" | "kind" | "route">;

/** Names the error itself, since the first question is whether it matters. */
export function buildErrorAlertPayload(errors: NewError[]): NotificationPayload {
  if (errors.length === 1) {
    const [error] = errors;
    return {
      title: `New error in ${SOURCE_LABEL[error!.source]}`,
      body: `${error!.kind} · ${error!.route}`,
      data: { url: "/admin" },
    };
  }
  const listed = errors.slice(0, 2).map((error) => `${error.kind} (${SOURCE_SHORT[error.source]})`);
  const more = errors.length - listed.length;
  return {
    title: `${errors.length} new kinds of errors`,
    body: more > 0 ? `${listed.join(" · ")} +${more} more` : listed.join(" · "),
    data: { url: "/admin" },
  };
}

/** Kinds announced in one push at most; the rest wait for the next minute. */
const ALERT_BATCH = 20;

/**
 * Runs on the every-minute tick. Claims every kind not yet announced and
 * sends one push for the lot, so a burst of new kinds is one alert, and two
 * overlapping ticks can't announce the same kind twice.
 */
export async function alertNewErrors(
  env: Env,
  now = new Date(),
  alert: typeof notifyAdmins = notifyAdmins
): Promise<number> {
  let claimed: NewError[];
  try {
    const result = await env.DB.prepare(
      `UPDATE errors SET alerted_at = ?
       WHERE id IN (
         SELECT id FROM errors WHERE alerted_at IS NULL ORDER BY first_seen_at ASC LIMIT ?
       )
       RETURNING source, kind, route, first_seen_at`
    ).bind(now.toISOString(), ALERT_BATCH).all<NewError & { first_seen_at: string }>();
    claimed = (result.results ?? []).sort((a, b) => a.first_seen_at.localeCompare(b.first_seen_at));
  } catch (error) {
    // Before migration 0093 reaches a database there is nothing to announce.
    if (error instanceof Error && error.message.includes("no such table")) return 0;
    throw error;
  }
  if (claimed.length === 0) return 0;
  await alert(env.DB, env, buildErrorAlertPayload(claimed));
  return claimed.length;
}

export async function listErrors(db: D1Database, limit = 50): Promise<ErrorRow[]> {
  const result = await db.prepare(
    `SELECT * FROM errors ORDER BY last_seen_at DESC LIMIT ?`
  ).bind(Math.min(Math.max(limit, 1), 200)).all<ErrorRow>();
  return result.results ?? [];
}
