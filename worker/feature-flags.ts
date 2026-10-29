import { createMiddleware } from "hono/factory";
import { isAdminUser } from "./auth";
import type { Env, Variables } from "./types";

export type FeatureFlag = "OUTREACH" | "AUTO_APPLY" | "AUTO_APPLY_SEND" | "SUPPORT";

/** A flag set to "on" opens a feature to every signed-in user, "admin" to
 * admins and the people granted it; anything else keeps it off. */
export function flagEnabled(value: string | undefined, isAdmin: boolean, granted = false): boolean {
  const mode = value?.trim().toLowerCase();
  return mode === "on" || (mode === "admin" && (isAdmin || granted));
}

/** The flags opened to this person ahead of everyone (migration 0107), for
 * a signed-in account only. */
export async function grantedFlags(db: D1Database, userId: string, sessionState: Variables["sessionState"]): Promise<Set<FeatureFlag>> {
  if (sessionState !== "authenticated") return new Set();
  const rows = await db.prepare("SELECT flag FROM feature_grants WHERE user_id = ?").bind(userId).all<{ flag: string }>();
  return new Set((rows.results ?? []).map((row) => row.flag as FeatureFlag));
}

/** Answers 404 while the feature is off for this user, as if it didn't exist. */
export function requireFlag(flag: FeatureFlag) {
  return createMiddleware<{ Bindings: Env; Variables: Variables }>(async (c, next) => {
    const value = c.env[flag];
    const adminOnly = value?.trim().toLowerCase() === "admin";
    const isAdmin = adminOnly && await isAdminUser(c.env.DB, c.get("userId"), c.get("sessionState"));
    const granted = adminOnly && !isAdmin && (await grantedFlags(c.env.DB, c.get("userId"), c.get("sessionState"))).has(flag);
    if (!flagEnabled(value, isAdmin, granted)) {
      return c.json({ error: "Not found", code: "not_found" }, 404);
    }
    await next();
  });
}
