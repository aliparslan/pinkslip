import { Hono } from "hono";
import type { Env, PreferenceRow } from "../types";

const preferences = new Hono<{ Bindings: Env }>();

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

async function readPreferences(db: D1Database): Promise<Record<string, unknown>> {
  const result = await db.prepare("SELECT key, value FROM preferences").all<PreferenceRow>();
  const rows = result.results ?? [];
  const out: Record<string, unknown> = {};

  for (const row of rows) {
    const normalizedKey = normalizePreferenceKey(row.key);
    out[normalizedKey] = parsePreferenceValue(row.value);
  }

  return out;
}

// GET / — Get all preferences as key-value object
preferences.get("/", async (c) => {
  return c.json(await readPreferences(c.env.DB));
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

  const stmts = [...normalizedEntries.entries()].map(([key, value]) =>
    c.env.DB.prepare("INSERT OR REPLACE INTO preferences (key, value) VALUES (?, ?)")
      .bind(key, JSON.stringify(value))
  );

  if (normalizedEntries.has("notify_threshold")) {
    stmts.unshift(
      c.env.DB.prepare("DELETE FROM preferences WHERE key = 'notification_threshold'")
    );
  }

  if (stmts.length > 0) {
    await c.env.DB.batch(stmts);
  }

  return c.json(await readPreferences(c.env.DB));
});

export default preferences;
