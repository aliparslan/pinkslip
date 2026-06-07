import { Hono } from "hono";
import { requireAdmin } from "../auth";
import type { Env, FetchRunRow, Variables } from "../types";

const runs = new Hono<{ Bindings: Env; Variables: Variables }>();

async function hasFetchRunsTable(db: D1Database): Promise<boolean> {
  try {
    const row = await db.prepare(
      `SELECT name
       FROM sqlite_master
       WHERE type = 'table' AND name = 'fetch_runs'
       LIMIT 1`
    ).first<{ name: string }>();

    return Boolean(row?.name);
  } catch {
    return false;
  }
}

runs.get("/", requireAdmin, async (c) => {
  const limit = Math.min(parseInt(c.req.query("limit") ?? "50", 10) || 50, 100);

  if (!(await hasFetchRunsTable(c.env.DB))) {
    return c.json({ runs: [] });
  }

  try {
    const result = await c.env.DB.prepare(
      `SELECT *
       FROM fetch_runs
       ORDER BY datetime(started_at) DESC, started_at DESC
       LIMIT ?`
    ).bind(limit).all<FetchRunRow>();

    return c.json({ runs: result.results ?? [] });
  } catch (error) {
    // Older local DBs may not have fetch_runs yet; keep profile/settings usable.
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("no such table: fetch_runs")) {
      return c.json({ runs: [] });
    }
    throw error;
  }
});

export default runs;
