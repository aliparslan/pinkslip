import { Hono } from "hono";
import type { Env, Variables } from "../types";
import { ensureEligibleJobs } from "../job-scope";
import { MATCH_SCORER_VERSION } from "../user-job-scores";
import { MAX_POSTED_AGE_DAYS } from "../../shared/job-policy";

const stats = new Hono<{ Bindings: Env; Variables: Variables }>();

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
       WHERE ujm.user_id = ?
         AND c.enabled = 1
         AND j.closed_at IS NULL
         AND ujm.scorer_version = ?
         AND j.description IS NOT NULL
         AND trim(j.description) != ''
         AND (j.posted_at IS NULL OR datetime(j.posted_at) > datetime('now', '-${MAX_POSTED_AGE_DAYS + 1} days'))
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
      .bind(userId, MATCH_SCORER_VERSION, userId, userId)
      .first<{ count: number }>(),
    c.env.DB.prepare(
      `SELECT COUNT(*) AS count FROM user_job_matches ujm
       JOIN jobs j ON j.id = ujm.job_id
       JOIN companies c ON j.company_id = c.id
       WHERE ujm.user_id = ?
         AND c.enabled = 1
         AND j.closed_at IS NULL
         AND ujm.scorer_version = ?
         AND j.description IS NOT NULL
         AND trim(j.description) != ''
         AND (j.posted_at IS NULL OR datetime(j.posted_at) > datetime('now', '-${MAX_POSTED_AGE_DAYS + 1} days'))
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
      .bind(userId, MATCH_SCORER_VERSION, today, userId, userId)
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
      "SELECT COUNT(*) AS count FROM applications WHERE user_id = ? AND job_id IS NOT NULL"
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
    appliedJobs: appsResult?.count ?? 0,
    savedJobs: savedResult?.count ?? 0,
    lastPolled: lastPollResult?.ts ?? null,
  });
});

export default stats;
