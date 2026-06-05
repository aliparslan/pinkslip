import { Hono } from "hono";
import type { Env, PreferenceRow, Variables } from "../types";
import { readUserPreferences, writeUserPreferences } from "../account";

const preferences = new Hono<{ Bindings: Env; Variables: Variables }>();

const ALLOWED_KEYS = new Set([
  "locations",
  "min_yoe",
  "max_yoe",
  "role_keywords",
  "negative_keywords",
  "notify_threshold",
]);

function parsePreferenceValue(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function normalizePreferenceKey(key: string): string {
  return key === "notification_threshold" ? "notify_threshold" : key;
}

async function readPreferences(db: D1Database, userId: string): Promise<Record<string, unknown>> {
  const rows = await readUserPreferences(db, userId);
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(rows)) {
    const normalizedKey = normalizePreferenceKey(key);
    if (normalizedKey === "notification_threshold") continue;
    out[normalizedKey] =
      typeof value === "string"
        ? parsePreferenceValue(value)
        : value;
  }
  return out;
}

// GET / — Get all preferences as key-value object
preferences.get("/", async (c) => {
  return c.json(await readPreferences(c.env.DB, c.get("userId")));
});

// PUT / — Update preferences
preferences.put("/", async (c) => {
  const body = await c.req.json<Record<string, unknown>>();
  const normalizedEntries = new Map<string, unknown>();

  for (const [key, value] of Object.entries(body)) {
    const normalizedKey = normalizePreferenceKey(key);
    if (ALLOWED_KEYS.has(normalizedKey)) {
      normalizedEntries.set(normalizedKey, value);
    }
  }

  await writeUserPreferences(
    c.env.DB,
    c.get("userId"),
    [...normalizedEntries.entries()].map(([key, value]) => ({
      key,
      value: JSON.stringify(value),
    }))
  );

  return c.json(await readPreferences(c.env.DB, c.get("userId")));
});

export default preferences;
