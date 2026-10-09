import { createMiddleware } from "hono/factory";
import { isAdminUser } from "./auth";
import type { Env, Variables } from "./types";

export type FeatureFlag = "OUTREACH" | "AUTO_APPLY";

/** A flag set to "on" opens a feature to every signed-in user, "admin" to
 * admins only; anything else keeps it off. */
export function flagEnabled(value: string | undefined, isAdmin: boolean): boolean {
  const mode = value?.trim().toLowerCase();
  return mode === "on" || (mode === "admin" && isAdmin);
}

/** Answers 404 while the feature is off for this user, as if it didn't exist. */
export function requireFlag(flag: FeatureFlag) {
  return createMiddleware<{ Bindings: Env; Variables: Variables }>(async (c, next) => {
    const value = c.env[flag];
    const isAdmin = value?.trim().toLowerCase() === "admin"
      && await isAdminUser(c.env.DB, c.get("userId"), c.get("sessionState"));
    if (!flagEnabled(value, isAdmin)) {
      return c.json({ error: "Not found", code: "not_found" }, 404);
    }
    await next();
  });
}
