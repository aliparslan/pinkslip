import { Hono } from "hono";
import type { Env, Variables } from "../types";
import {
  defaultUserPreferenceState,
  loadUserPreferenceState,
  saveUserPreferenceState,
} from "../user-preferences";

const preferences = new Hono<{ Bindings: Env; Variables: Variables }>();

// GET / — Get all preferences as key-value object
preferences.get("/", async (c) => {
  if (c.get("sessionState") === "anonymous") {
    return c.json(defaultUserPreferenceState());
  }
  return c.json(await loadUserPreferenceState(c.env.DB, c.get("userId")));
});

// PUT / — Update preferences
preferences.put("/", async (c) => {
  const body = await c.req.json<Record<string, unknown>>();
  const state = await saveUserPreferenceState(
    c.env.DB,
    c.get("userId"),
    {
      search_profile: body.search_profile,
      notify_threshold: body.notify_threshold ?? body.notification_threshold,
    }
  );
  return c.json(state);
});

export default preferences;
