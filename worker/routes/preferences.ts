import { Hono } from "hono";
import type { Env, PreferenceRow } from "../types";

const preferences = new Hono<{ Bindings: Env }>();

// GET / — Get all preferences as key-value object
preferences.get("/", async (c) => {
  const result = await c.env.DB.prepare(
    "SELECT key, value FROM preferences"
  ).all<PreferenceRow>();

  const rows = result.results ?? [];
  const out: Record<string, unknown> = {};

  for (const row of rows) {
    try {
      out[row.key] = JSON.parse(row.value);
    } catch {
      out[row.key] = row.value;
    }
  }

  return c.json(out);
});

// PUT / — Update preferences
preferences.put("/", async (c) => {
  const body = await c.req.json<Record<string, unknown>>();

  const stmts = Object.entries(body).map(([key, value]) =>
    c.env.DB.prepare(
      "INSERT OR REPLACE INTO preferences (key, value) VALUES (?, ?)"
    ).bind(key, JSON.stringify(value))
  );

  if (stmts.length > 0) {
    await c.env.DB.batch(stmts);
  }

  // Return updated preferences
  const result = await c.env.DB.prepare(
    "SELECT key, value FROM preferences"
  ).all<PreferenceRow>();

  const rows = result.results ?? [];
  const out: Record<string, unknown> = {};

  for (const row of rows) {
    try {
      out[row.key] = JSON.parse(row.value);
    } catch {
      out[row.key] = row.value;
    }
  }

  return c.json(out);
});

export default preferences;
