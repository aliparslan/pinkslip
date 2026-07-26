import { Hono } from "hono";
import type { Env, Variables } from "../types";
import { ensureEligibleJobs } from "../job-scope";
import { SCORE_RAW_PER_PERCENT } from "../../shared/scoring";

const stats = new Hono<{ Bindings: Env; Variables: Variables }>();

// GET / — Return aggregate stats (apps/saved scoped to user)
stats.get("/", async (c) => {
  const userId = c.get("userId");
  const today = new Date().toISOString().slice(0, 10);
  await ensureEligibleJobs(c.env.DB);

  const [totalResult, todayResult, companiesResult, appsResult, savedResult, lastPollResult] = await Promise.all([
    c.env.DB.prepare(
      `SELECT COUNT(*) AS count
       FROM user_job_matches ujm
       JOIN jobs j ON j.id = ujm.job_id
       JOIN companies c ON j.company_id = c.id
       JOIN user_search_profiles usp ON usp.user_id = ujm.user_id
       WHERE ujm.user_id = ?
         AND c.enabled = 1
         AND j.closed_at IS NULL
         AND ujm.score >= CAST(ROUND(usp.match_threshold * ${SCORE_RAW_PER_PERCENT}) AS INTEGER)
         AND NOT EXISTS (
           SELECT 1
           FROM dismissed_jobs d
           WHERE d.user_id = ? AND d.job_id = j.id
         )
         AND NOT EXISTS (
           SELECT 1 FROM user_blocked_companies ubc
           WHERE ubc.user_id = ? AND ubc.company_id = j.company_id
         )`
    )
      .bind(userId, userId, userId)
      .first<{ count: number }>(),
    c.env.DB.prepare(
      `SELECT COUNT(*) AS count FROM user_job_matches ujm
       JOIN jobs j ON j.id = ujm.job_id
       JOIN companies c ON j.company_id = c.id
       JOIN user_search_profiles usp ON usp.user_id = ujm.user_id
       WHERE ujm.user_id = ?
         AND c.enabled = 1
         AND j.closed_at IS NULL
         AND ujm.score >= CAST(ROUND(usp.match_threshold * ${SCORE_RAW_PER_PERCENT}) AS INTEGER)
         AND substr(j.first_seen_at, 1, 10) = ?
         AND NOT EXISTS (
           SELECT 1
           FROM dismissed_jobs d
           WHERE d.user_id = ? AND d.job_id = j.id
         )
         AND NOT EXISTS (
           SELECT 1 FROM user_blocked_companies ubc
           WHERE ubc.user_id = ? AND ubc.company_id = j.company_id
         )`
    )
      .bind(userId, today, userId, userId)
      .first<{ count: number }>(),
    c.env.DB.prepare(
      `SELECT COUNT(*) AS count FROM companies c
       WHERE c.enabled = 1
         AND NOT EXISTS (
           SELECT 1 FROM user_blocked_companies ubc
           WHERE ubc.user_id = ? AND ubc.company_id = c.id
         )`
    ).bind(userId).first<{ count: number }>(),
    c.env.DB.prepare(
      "SELECT COUNT(*) AS count FROM applications WHERE user_id = ? AND stage NOT IN ('Rejected', 'Ghosted')"
    ).bind(userId).first<{ count: number }>().catch(() => ({ count: 0 })),
    c.env.DB.prepare(
      `SELECT COUNT(*) AS count
       FROM saved_jobs s
       JOIN jobs j ON j.id = s.job_id
       WHERE s.user_id = ?
         AND j.closed_at IS NULL
         AND NOT EXISTS (
           SELECT 1 FROM user_blocked_companies ubc
           WHERE ubc.user_id = ? AND ubc.company_id = j.company_id
         )`
    ).bind(userId, userId).first<{ count: number }>().catch(() => ({ count: 0 })),
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
