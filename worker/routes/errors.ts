import { Hono } from "hono";
import { requireAdmin } from "../auth";
import { listErrors, recordError } from "../errors";
import type { Env, Variables } from "../types";

const errors = new Hono<{ Bindings: Env; Variables: Variables }>();

/** A report's JSON is small; anything larger is not an error report. */
const MAX_BODY_BYTES = 16 * 1024;
/** Per address, per isolate: enough for a bad screen, not for a flood. */
const REPORTS_PER_MINUTE = 30;
/** New kinds the apps may add in an hour; past it, only known kinds count. */
export const NEW_APP_KINDS_PER_HOUR = 20;

const recentReports = new Map<string, { windowStart: number; count: number }>();

function overLimit(address: string, nowMs: number): boolean {
  if (recentReports.size > 5000) recentReports.clear();
  const entry = recentReports.get(address);
  if (!entry || nowMs - entry.windowStart >= 60_000) {
    recentReports.set(address, { windowStart: nowMs, count: 1 });
    return false;
  }
  entry.count += 1;
  return entry.count > REPORTS_PER_MINUTE;
}

/**
 * Not bugs in Pinkslip: a dropped connection, a cancelled request, an API
 * answer the server already recorded (or meant to give), and browser
 * extensions or layout warnings in the visitor's own browser.
 */
export function ignoredAppError(name: string, message: string, stack: string): boolean {
  if (name === "AbortError" || name === "ApiError") return true;
  if (/^(?:Failed to fetch|Network request failed|Load failed|NetworkError when attempting to fetch resource)/i.test(message)) return true;
  if (/ResizeObserver loop/i.test(message)) return true;
  return /(?:chrome|moz|safari|safari-web)-extension:\/\//i.test(`${message}\n${stack}`);
}

function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.slice(0, max) : "";
}

/**
 * The apps' JavaScript errors (Decisions: Admin #1). Open to anyone, without
 * a session, so a visitor whose page broke doesn't become a guest account;
 * the table only ever gains counts and a bounded number of new kinds.
 */
errors.post("/", async (c) => {
  if (Number(c.req.header("content-length") ?? "0") > MAX_BODY_BYTES) return c.body(null, 204);
  const address = (c.req.header("cf-connecting-ip") ?? "unknown").trim();
  if (overLimit(address, Date.now())) return c.body(null, 204);

  const raw = await c.req.text().catch(() => "");
  if (raw.length > MAX_BODY_BYTES) return c.body(null, 204);
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return c.json({ error: "Invalid report" }, 400);
  }
  const name = text(body.name, 80) || "Error";
  const message = text(body.message, 2000);
  const stack = text(body.stack, 8000);
  if (!message) return c.json({ error: "Invalid report" }, 400);
  if (ignoredAppError(name, message, stack)) return c.body(null, 204);

  const now = new Date();
  const recentNew = await c.env.DB.prepare(
    `SELECT COUNT(*) AS count FROM errors
     WHERE source IN ('ios', 'web') AND first_seen_at > ?`
  ).bind(new Date(now.getTime() - 60 * 60 * 1000).toISOString()).first<{ count: number }>();

  await recordError(c.env.DB, {
    source: c.req.header("x-pinkslip-client") === "ios" ? "ios" : "web",
    name,
    message,
    stack: stack || null,
    route: text(body.route, 200) || "unknown",
    build: text(body.build, 40) || c.req.header("x-pinkslip-build") || null,
  }, { now, allowNew: (recentNew?.count ?? 0) < NEW_APP_KINDS_PER_HOUR });
  return c.body(null, 204);
});

errors.get("/", requireAdmin, async (c) => {
  const limit = Number.parseInt(c.req.query("limit") ?? "50", 10) || 50;
  return c.json({ errors: await listErrors(c.env.DB, limit) });
});

export default errors;
