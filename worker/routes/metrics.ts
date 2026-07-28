import { Hono } from "hono";
import { requireAdmin } from "../auth";
import type { Env, Variables } from "../types";
import { ensureEligibleJobs } from "../job-scope";
import { MATCH_SCORER_VERSION } from "../user-job-scores";
import { MAX_POSTED_AGE_DAYS } from "../../shared/job-policy";

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

metrics.get("/", async (c) => {
  const db = c.env.DB;
  await ensureEligibleJobs(db);
  const [
    notificationLatency,
    eventCounts,
    viableUsers,
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
             AND ujm.scorer_version = ?
             AND j.closed_at IS NULL
             AND j.description IS NOT NULL
             AND trim(j.description) != ''
             AND (j.posted_at IS NULL OR datetime(j.posted_at) > datetime('now', '-${MAX_POSTED_AGE_DAYS + 1} days'))
             AND NOT EXISTS (
               SELECT 1 FROM user_blocked_companies ubc
               WHERE ubc.user_id = usp.user_id AND ubc.company_id = j.company_id
             )
         ) >= 10 THEN 1 ELSE 0 END) AS enough_matches
       FROM user_search_profiles usp`
    ).bind(MATCH_SCORER_VERSION).first<ViableUserRow>(),
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
    accounts_created: Number(events.account_created ?? 0),
    push_registrations: Number(events.push_registered ?? 0),
    profile_adjustments: Number(events.search_profile_adjusted ?? 0),
    tailoring_to_application_rate: completedTailorings > 0
      ? Math.round((convertedTailorings / completedTailorings) * 1000) / 10
      : 0,
    open_reports: Number(openReports?.count ?? 0),
    open_feedback: Number(openFeedback?.count ?? 0),
    events,
  });
});

export default metrics;
