import { Hono } from "hono";
import { requireAdmin } from "../auth";
import type { Env, Variables } from "../types";
import { ensureEligibleJobs } from "../job-scope";

const metrics = new Hono<{ Bindings: Env; Variables: Variables }>();
metrics.use("/*", requireAdmin);

interface NotificationMetricRow {
  sent_count: number;
  avg_seconds: number | null;
  open_rate: number | null;
}

interface CountRow {
  count: number;
}

interface ViableUserRow {
  total_profiles: number;
  enough_matches: number;
}

interface HighScoreOutcomeRow {
  total: number;
  dismissed: number;
}

interface ScorerAuditRow {
  candidate_version: string;
  comparisons: number;
  average_delta: number;
  major_disagreements: number;
}

interface RolloutRow {
  scorer_version: string;
  mode: "off" | "shadow" | "active";
  cohort_percent: number;
  updated_at: string;
}

metrics.get("/", async (c) => {
  const db = c.env.DB;
  await ensureEligibleJobs(db);
  const [
    notificationLatency,
    eventCounts,
    viableUsers,
    scorerAudits,
    openReports,
    openFeedback,
    promptApplyClicks,
    highScoreOutcomes,
    tailoringConversions,
  ] = await Promise.all([
    db.prepare(
      `SELECT
         COUNT(*) AS sent_count,
         ROUND(AVG((julianday(nc.sent_at) - julianday(j.first_seen_at)) * 86400)) AS avg_seconds,
         ROUND(AVG(CASE WHEN nc.opened_at IS NOT NULL THEN 1.0 ELSE 0 END) * 100, 1) AS open_rate
       FROM notification_candidates nc
       JOIN jobs j ON j.id = nc.job_id
       WHERE nc.status = 'sent'
         AND datetime(nc.sent_at) >= datetime('now', '-30 days')`
    ).first<NotificationMetricRow>(),
    db.prepare(
      `SELECT event_name, COUNT(*) AS count
       FROM product_events
       WHERE datetime(occurred_at) >= datetime('now', '-30 days')
       GROUP BY event_name`
    ).all<{ event_name: string; count: number }>(),
    db.prepare(
      `SELECT
         COUNT(*) AS total_profiles,
         SUM(CASE WHEN (
           SELECT COUNT(*)
           FROM user_job_matches ujm
           JOIN jobs j ON j.id = ujm.job_id
           WHERE ujm.user_id = usp.user_id
             AND ujm.score >= CAST(ROUND(usp.match_threshold * 0.95) AS INTEGER)
             AND j.closed_at IS NULL
             AND NOT EXISTS (
               SELECT 1 FROM user_blocked_companies ubc
               WHERE ubc.user_id = usp.user_id AND ubc.company_id = j.company_id
             )
         ) >= 10 THEN 1 ELSE 0 END) AS enough_matches
       FROM user_search_profiles usp`
    ).first<ViableUserRow>(),
    db.prepare(
      `SELECT
         candidate_version,
         COUNT(*) AS comparisons,
         ROUND(AVG(delta), 2) AS average_delta,
         SUM(CASE WHEN ABS(delta) >= 10 THEN 1 ELSE 0 END) AS major_disagreements
       FROM scorer_audits
       WHERE datetime(created_at) >= datetime('now', '-30 days')
       GROUP BY candidate_version`
    ).all<ScorerAuditRow>(),
    db.prepare(
      "SELECT COUNT(*) AS count FROM content_reports WHERE status = 'open'"
    ).first<CountRow>(),
    db.prepare(
      "SELECT COUNT(*) AS count FROM feedback_submissions WHERE status IN ('new', 'planned')"
    ).first<CountRow>(),
    db.prepare(
      `SELECT COUNT(DISTINCT pe.user_id || ':' || pe.entity_id) AS count
       FROM product_events pe
       JOIN notification_candidates nc
         ON nc.user_id = pe.user_id
        AND nc.job_id = pe.entity_id
        AND nc.status = 'sent'
       WHERE pe.event_name = 'apply_clicked'
         AND datetime(pe.occurred_at) >= datetime('now', '-30 days')
         AND datetime(pe.occurred_at) >= datetime(nc.sent_at)
         AND datetime(pe.occurred_at) <= datetime(nc.sent_at, '+1 hour')`
    ).first<CountRow>(),
    db.prepare(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN EXISTS (
           SELECT 1 FROM dismissed_jobs d
           WHERE d.user_id = ujm.user_id AND d.job_id = ujm.job_id
         ) THEN 1 ELSE 0 END) AS dismissed
       FROM user_job_matches ujm
       WHERE ujm.score >= 76
         AND datetime(ujm.matched_at) >= datetime('now', '-30 days')`
    ).first<HighScoreOutcomeRow>(),
    db.prepare(
      `SELECT
         COUNT(*) AS completed,
         SUM(CASE WHEN EXISTS (
           SELECT 1
           FROM product_events application
           WHERE application.event_name = 'application_added'
             AND application.user_id = tailored.user_id
             AND application.entity_id = tailored.entity_id
             AND datetime(application.occurred_at) >= datetime(tailored.occurred_at)
         ) THEN 1 ELSE 0 END) AS converted
       FROM product_events tailored
       WHERE tailored.event_name = 'tailoring_completed'
         AND datetime(tailored.occurred_at) >= datetime('now', '-30 days')`
    ).first<{ completed: number; converted: number }>(),
  ]);

  const events = Object.fromEntries(
    (eventCounts.results ?? []).map((row) => [row.event_name, Number(row.count)])
  );
  const onboardingStarted = Number(events.onboarding_started ?? 0);
  const onboardingCompleted = Number(events.onboarding_completed ?? 0);
  const highScoreTotal = Number(highScoreOutcomes?.total ?? 0);
  const highDismissals = Number(highScoreOutcomes?.dismissed ?? 0);
  const completedTailorings = Number(tailoringConversions?.completed ?? 0);
  const convertedTailorings = Number(tailoringConversions?.converted ?? 0);

  return c.json({
    period_days: 30,
    notification_latency_seconds: Number(notificationLatency?.avg_seconds ?? 0),
    notification_open_rate: Number(notificationLatency?.open_rate ?? 0),
    notifications_sent: Number(notificationLatency?.sent_count ?? 0),
    apply_clicks_within_one_hour: Number(promptApplyClicks?.count ?? 0),
    high_score_dismissal_rate: highScoreTotal > 0
      ? Math.round((highDismissals / highScoreTotal) * 1000) / 10
      : 0,
    users_with_enough_matches: Number(viableUsers?.enough_matches ?? 0),
    total_profiles: Number(viableUsers?.total_profiles ?? 0),
    onboarding_completion_rate: onboardingStarted > 0
      ? Math.round((onboardingCompleted / onboardingStarted) * 1000) / 10
      : 0,
    profile_adjustments: Number(events.search_profile_adjusted ?? 0),
    tailoring_to_application_rate: completedTailorings > 0
      ? Math.round((convertedTailorings / completedTailorings) * 1000) / 10
      : 0,
    open_reports: Number(openReports?.count ?? 0),
    open_feedback: Number(openFeedback?.count ?? 0),
    scorer_audits: scorerAudits.results ?? [],
    events,
  });
});

metrics.get("/rollouts", async (c) => {
  const result = await c.env.DB.prepare(
    `SELECT scorer_version, mode, cohort_percent, updated_at
     FROM scorer_rollouts
     ORDER BY datetime(updated_at) DESC`
  ).all<RolloutRow>();
  return c.json({ rollouts: result.results ?? [] });
});

metrics.patch("/rollouts/:version", async (c) => {
  const version = c.req.param("version");
  const body = await c.req.json<{ mode?: string; cohort_percent?: number }>();
  if (!["off", "shadow", "active"].includes(body.mode ?? "")) {
    return c.json({ error: "Choose off, shadow, or active" }, 400);
  }
  const cohortPercent = Math.max(0, Math.min(100, Math.round(Number(body.cohort_percent))));
  if (!Number.isFinite(cohortPercent)) {
    return c.json({ error: "Cohort percent must be between 0 and 100" }, 400);
  }

  const result = await c.env.DB.prepare(
    `UPDATE scorer_rollouts
     SET mode = ?, cohort_percent = ?, updated_at = ?
     WHERE scorer_version = ?`
  ).bind(body.mode, cohortPercent, new Date().toISOString(), version).run();
  if ((result.meta.changes ?? 0) === 0) {
    return c.json({ error: "Scorer rollout not found" }, 404);
  }

  // Do NOT wipe user_job_matches here. A synchronous full-table DELETE empties
  // every feed at once and can time out on a production-sized database (and it
  // ran even for shadow changes, which don't affect stored scores). Each user's
  // matches are re-scored lazily by removeStaleMatches() on their next feed load,
  // which only clears rows whose scorer_version no longer matches their cohort.
  const rollout = await c.env.DB.prepare(
    `SELECT scorer_version, mode, cohort_percent, updated_at
     FROM scorer_rollouts WHERE scorer_version = ?`
  ).bind(version).first<RolloutRow>();
  return c.json({ rollout });
});

export default metrics;
