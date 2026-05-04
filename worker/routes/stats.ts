import { Hono } from "hono";
import type { Env, Variables } from "../types";

const stats = new Hono<{ Bindings: Env; Variables: Variables }>();

// GET / — Return aggregate stats (apps/saved scoped to user)
stats.get("/", async (c) => {
  const userId = c.get("userId");
  const today = new Date().toISOString().slice(0, 10);

  const [totalResult, todayResult, companiesResult, appsResult, savedResult, lastPollResult] = await Promise.all([
    c.env.DB.prepare(
      `SELECT COUNT(*) AS count
       FROM jobs j
       JOIN companies c ON j.company_id = c.id
       WHERE c.enabled = 1
         AND j.closed_at IS NULL
         AND NOT EXISTS (
           SELECT 1
           FROM dismissed_jobs d
           WHERE d.user_id = ? AND d.job_id = j.id
         )`
    )
      .bind(userId)
      .first<{ count: number }>(),
    c.env.DB.prepare(
      `SELECT COUNT(*) AS count FROM jobs j
       JOIN companies c ON j.company_id = c.id
       WHERE c.enabled = 1
         AND j.closed_at IS NULL
         AND substr(j.first_seen_at, 1, 10) = ?
         AND NOT EXISTS (
           SELECT 1
           FROM dismissed_jobs d
           WHERE d.user_id = ? AND d.job_id = j.id
         )`
    )
      .bind(today, userId)
      .first<{ count: number }>(),
    c.env.DB.prepare(
      "SELECT COUNT(*) AS count FROM companies WHERE enabled = 1"
    ).first<{ count: number }>(),
    c.env.DB.prepare(
      "SELECT COUNT(*) AS count FROM applications WHERE user_id = ? AND stage NOT IN ('Rejected', 'Ghosted')"
    ).bind(userId).first<{ count: number }>().catch(() => ({ count: 0 })),
    c.env.DB.prepare(
      "SELECT COUNT(*) AS count FROM saved_jobs WHERE user_id = ?"
    ).bind(userId).first<{ count: number }>().catch(() => ({ count: 0 })),
    c.env.DB.prepare(
      "SELECT value AS ts FROM preferences WHERE key = 'last_polled_at'"
    ).first<{ ts: string | null }>().catch(() => ({ ts: null })),
  ]);

  return c.json({
    totalJobs: totalResult?.count ?? 0,
    newToday: todayResult?.count ?? 0,
    activeCompanies: companiesResult?.count ?? 0,
    activeApplications: appsResult?.count ?? 0,
    savedJobs: savedResult?.count ?? 0,
    lastPolled: lastPollResult?.ts ?? null,
  });
});

export default stats;
