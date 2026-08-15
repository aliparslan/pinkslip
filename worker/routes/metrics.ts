import { Hono } from "hono";
import { requireAdmin } from "../auth";
import type { Env, Variables } from "../types";
import { ensureEligibleJobs } from "../job-scope";
import { MATCHER_VERSION } from "../user-job-matches";
import { MAX_POSTED_AGE_DAYS } from "../../shared/job-policy";
import {
  evaluateTailoringQuality,
  type TailoringQualitySnapshot,
} from "../../shared/tailoring-quality";

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

interface EligibleOutcomeRow {
  total: number;
  dismissed: number;
}

interface TailoringQualityMetricRow {
  tailoring_id: string | null;
  stage: string;
  outcome: string;
  duration_ms: number | null;
  input_tokens: number | null;
  output_tokens: number | null;
  requirement_count: number | null;
  requirement_source_count: number | null;
  bullet_count: number | null;
  unsupported_claim_count: number | null;
  page_count: number | null;
  removed_item_count: number | null;
  edited_bullet_count: number | null;
  baseline_bullet_count: number | null;
  error_code: string | null;
}

function ratio(numerator: number, denominator: number): number {
  return denominator > 0 ? numerator / denominator : 0;
}

function average(values: number[]): number {
  return values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function percentile95(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.ceil(sorted.length * 0.95) - 1] ?? 0;
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
    eligibleOutcomes,
    tailoringConversions,
    tailoringQualityRows,
    tailoringArtifactSelection,
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
             AND ujm.matcher_version = ?
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
    ).bind(MATCHER_VERSION).first<ViableUserRow>(),
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
       WHERE datetime(ujm.matched_at) >= datetime('now', '-30 days')`
    ).first<EligibleOutcomeRow>(),
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
    db.prepare(
      `SELECT tailoring_id, stage, outcome, duration_ms, input_tokens, output_tokens,
              requirement_count, requirement_source_count, bullet_count,
              unsupported_claim_count, page_count, removed_item_count,
              edited_bullet_count, baseline_bullet_count, error_code
       FROM tailoring_quality_events
       WHERE datetime(created_at) >= datetime('now', '-30 days')
       ORDER BY created_at DESC
       LIMIT 5000`
    ).all<TailoringQualityMetricRow>(),
    db.prepare(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN s.artifact_id IS NOT NULL THEN 1 ELSE 0 END) AS selected
       FROM tailored_resume_artifacts a
       LEFT JOIN tailoring_artifact_selections s ON s.artifact_id = a.id
       WHERE a.storage_state = 'available'
         AND datetime(a.created_at) >= datetime('now', '-30 days')`
    ).first<{ total: number; selected: number }>(),
  ]);

  const events = Object.fromEntries(
    (eventCounts.results ?? []).map((row) => [row.event_name, Number(row.count)])
  );
  const onboardingStarted = Number(events.onboarding_started ?? 0);
  const onboardingCompleted = Number(events.onboarding_completed ?? 0);
  const eligibleTotal = Number(eligibleOutcomes?.total ?? 0);
  const eligibleDismissals = Number(eligibleOutcomes?.dismissed ?? 0);
  const completedTailorings = Number(tailoringConversions?.completed ?? 0);
  const convertedTailorings = Number(tailoringConversions?.converted ?? 0);
  const qualityRows = tailoringQualityRows.results ?? [];
  const artifactRows = qualityRows.filter((row) => (
    row.stage === "artifact" && row.outcome === "succeeded" && row.error_code !== "selected"
  ));
  const planRows = qualityRows.filter((row) => row.stage === "plan" && row.outcome === "succeeded");
  const generationRows = qualityRows.filter((row) => row.stage === "generate");
  const compileRows = qualityRows.filter((row) => row.stage === "compile");
  const pipelineLatencyByTailoring = new Map<string, number>();
  for (const row of qualityRows) {
    if (!row.tailoring_id || (row.stage !== "plan" && row.stage !== "generate") || row.duration_ms == null) continue;
    pipelineLatencyByTailoring.set(
      row.tailoring_id,
      (pipelineLatencyByTailoring.get(row.tailoring_id) ?? 0) + row.duration_ms,
    );
  }
  const requirementCount = planRows.reduce((sum, row) => sum + Number(row.requirement_count ?? 0), 0);
  const requirementSourceCount = planRows.reduce((sum, row) => sum + Number(row.requirement_source_count ?? 0), 0);
  const generatedBulletCount = generationRows.reduce((sum, row) => sum + Number(row.bullet_count ?? 0), 0);
  const unsupportedClaims = generationRows.reduce((sum, row) => sum + Number(row.unsupported_claim_count ?? 0), 0);
  const artifactTotal = Number(tailoringArtifactSelection?.total ?? 0);
  const snapshot: TailoringQualitySnapshot = {
    sampleSize: artifactRows.length,
    unsupportedClaimRate: ratio(unsupportedClaims, generatedBulletCount),
    requirementSourceCoverage: ratio(requirementSourceCount, requirementCount),
    onePageRate: ratio(artifactRows.filter((row) => row.page_count === 1).length, artifactRows.length),
    averageRemovedItems: average(artifactRows.map((row) => Number(row.removed_item_count ?? 0))),
    averageEditDistance: ratio(
      artifactRows.reduce((sum, row) => sum + Number(row.edited_bullet_count ?? 0), 0),
      artifactRows.reduce((sum, row) => sum + Number(row.baseline_bullet_count ?? 0), 0),
    ),
    deviceFailureRate: ratio(
      compileRows.filter((row) => row.outcome === "failed").length,
      compileRows.length,
    ),
    p95LatencyMs: percentile95([...pipelineLatencyByTailoring.values()]),
    averageInputTokens: average(generationRows.map((row) => Number(row.input_tokens ?? 0))),
    averageOutputTokens: average(generationRows.map((row) => Number(row.output_tokens ?? 0))),
    artifactAcceptanceRate: ratio(Number(tailoringArtifactSelection?.selected ?? 0), artifactTotal),
  };
  const tailoringQualityEvaluation = evaluateTailoringQuality(snapshot);

  return c.json({
    period_days: 30,
    notification_latency_seconds: Number(notificationLatency?.avg_seconds ?? 0),
    notification_open_rate: Number(notificationLatency?.open_rate ?? 0),
    notifications_sent: Number(notificationLatency?.sent_count ?? 0),
    apply_clicks_within_one_hour: Number(promptApplyClicks?.count ?? 0),
    eligible_job_dismissal_rate: eligibleTotal > 0
      ? Math.round((eligibleDismissals / eligibleTotal) * 1000) / 10
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
    tailoring_quality: {
      ...snapshot,
      ready: tailoringQualityEvaluation.ready,
      insufficientSample: tailoringQualityEvaluation.insufficientSample,
      failedGates: tailoringQualityEvaluation.failed.map((failure) => failure.gate),
    },
    open_reports: Number(openReports?.count ?? 0),
    open_feedback: Number(openFeedback?.count ?? 0),
    events,
  });
});

export default metrics;
