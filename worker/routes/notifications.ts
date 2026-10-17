import { Hono } from "hono";
import {
  loadNotificationSettings,
  saveNotificationSettings,
  SettingsError,
  type SettingsInput,
} from "../notifications";
import type { Env, Variables } from "../types";

/**
 * Settings per kind and the phone's time zone (docs/backend-inventory-
 * 2026-10-16.md, step 2). Only kinds that send today are listed, so an app
 * shows a switch only once its notification exists.
 */
const notifications = new Hono<{ Bindings: Env; Variables: Variables }>();

notifications.get("/", async (c) => c.json(await loadNotificationSettings(c.env.DB, c.get("userId"))));

/**
 * Body: `{ time_zone?: "America/Chicago", kinds?: { new_jobs?: { enabled?,
 * mode?: "post" | "daily", daily_time?: "08:00" }, saved_job_closed?: {
 * enabled? }, … } }`. Returns the settings after the change.
 */
notifications.patch("/", async (c) => {
  const body = await c.req.json<SettingsInput>().catch(() => null);
  if (!body || typeof body !== "object") return c.json({ error: "Invalid settings" }, 400);
  if (body.kinds !== undefined && (typeof body.kinds !== "object" || body.kinds === null || Array.isArray(body.kinds))) {
    return c.json({ error: "Invalid settings" }, 400);
  }
  try {
    return c.json(await saveNotificationSettings(c.env.DB, c.get("userId"), body));
  } catch (error) {
    if (error instanceof SettingsError) return c.json({ error: error.message }, 400);
    throw error;
  }
});

export default notifications;
