import { Hono } from "hono";
import type { Env } from "../types";

const stats = new Hono<{ Bindings: Env }>();

// GET / — Return aggregate stats
stats.get("/", async (c) => {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  const [totalResult, todayResult, companiesResult] = await Promise.all([
    c.env.DB.prepare("SELECT COUNT(*) AS count FROM jobs")
      .first<{ count: number }>(),
    c.env.DB.prepare(
      "SELECT COUNT(*) AS count FROM jobs WHERE first_seen_at >= ?"
    )
      .bind(`${today}T00:00:00.000Z`)
      .first<{ count: number }>(),
    c.env.DB.prepare(
      "SELECT COUNT(*) AS count FROM companies WHERE enabled = 1"
    ).first<{ count: number }>(),
  ]);

  return c.json({
    totalJobs: totalResult?.count ?? 0,
    newToday: todayResult?.count ?? 0,
    activeCompanies: companiesResult?.count ?? 0,
  });
});

export default stats;
