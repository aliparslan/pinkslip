import type {
  ClassificationDisagreement, Company, ContentReport, FeedbackSubmission, FetchRun, JobReview, PollTierLatency, ProductMetrics,
} from "@pinkslip/core/api";

/**
 * Admin on sample data (Paper "Admin · Oct 16"), for the kit and the
 * simulator, which isn't signed in as an admin. Times are relative to now so
 * "12 min ago" stays true.
 */
const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

const run = (id: string, minutes: number, found: number, alerts: number, failed = 0): FetchRun => ({
  id, scope: "all", status: failed ? "error" : "ok", companies_attempted: 215, companies_succeeded: 215 - failed, companies_failed: failed,
  new_jobs_found: found, notifications_sent: alerts, errors_json: null, started_at: minutesAgo(minutes), finished_at: minutesAgo(minutes - 2), duration_ms: 112_000,
});

export const SAMPLE_RUNS: FetchRun[] = [run("r1", 12, 9, 214, 3), run("r2", 27, 6, 140), run("r3", 42, 11, 310), run("r4", 180, 8, 290), run("r5", 600, 4, 250)];

const company = (id: string, name: string, ats: Company["ats_type"], slug: string, extra: Partial<Company> = {}): Company => ({
  id, name, ats_type: ats, ats_slug: slug, website: `https://${slug}.com`, enabled: 1,
  last_poll_status: "ok", last_poll_error: null, last_polled_at: minutesAgo(4), poll_failure_count: 0, quarantined_at: null, ...extra,
});

export const SAMPLE_COMPANIES: Company[] = [
  company("c1", "Ramp", "ashby", "ramp", { last_poll_status: "error", last_poll_error: "404 Not Found", last_polled_at: minutesAgo(12) }),
  company("c2", "Vercel", "greenhouse", "vercel", { last_poll_status: "error", last_poll_error: "Request timed out after 30000ms", last_polled_at: minutesAgo(12) }),
  company("c3", "Airbnb", "greenhouse", "airbnb", { quarantined_at: minutesAgo(60 * 24 * 2), poll_failure_count: 5, last_poll_status: "error", last_poll_error: "500" }),
  company("c4", "Stripe", "greenhouse", "stripe"),
  company("c5", "Notion", "ashby", "notion", { last_polled_at: minutesAgo(9) }),
  company("c6", "Duolingo", "greenhouse", "duolingo", { last_polled_at: minutesAgo(2) }),
  company("c7", "Figma", "greenhouse", "figma", { enabled: 0 }),
];

const review = (id: string, company: string, title: string, reasons: string[], location: string): JobReview => ({
  job_id: id, state: "needs_review", reason_codes: reasons, evidence: {}, classifier_version: "1", admin_note: null,
  created_at: minutesAgo(60), updated_at: minutesAgo(60), reviewed_at: null, title, url: "https://example.com/job", location, company_name: company,
});

export const SAMPLE_REVIEWS: JobReview[] = [
  review("j1", "Stripe", "Software Engineer II, Payments", ["ambiguous_title_level"], "Seattle"),
  review("j2", "Ramp", "Data Analyst", ["experience_requirement_unparsed"], "New York"),
  review("j3", "Duolingo", "Associate Product Manager", ["ambiguous_title_level", "experience_requirement_unparsed"], "Pittsburgh"),
  review("j4", "Datadog", "Machine Learning Scientist", ["advanced_degree_uncertain"], "Boston"),
];

export const SAMPLE_FEEDBACK: FeedbackSubmission[] = [
  { id: "f1", user_id: "u1", submission_type: "feature_request", title: "Can I filter by visa?", details: "I need sponsorship and would love to hide the jobs that won't.", careers_url: null, status: "new", admin_response: null, created_at: minutesAgo(90), updated_at: minutesAgo(90), resolved_at: null, user_name: "Maya Chen" },
  { id: "f2", user_id: "u2", submission_type: "company_request", title: "Add Anduril", details: "", careers_url: "https://www.anduril.com/careers", status: "new", admin_response: null, created_at: minutesAgo(400), updated_at: minutesAgo(400), resolved_at: null, user_name: "Sam" },
];

export const SAMPLE_REPORTS: ContentReport[] = [
  { id: "p1", company_id: "c4", job_id: "j9", report_type: "closed", notes: "The posting is closed", status: "open", admin_response: null, created_at: minutesAgo(200), company_name: "Stripe", job_title: "Backend Engineer, New Grad" },
  { id: "p2", company_id: "c2", job_id: "j8", report_type: "wrong_level", notes: "", status: "open", admin_response: null, created_at: minutesAgo(800), company_name: "Vercel", job_title: "Senior Software Engineer" },
];

const field = (name: string, label: string, rules: string, jev: string, confidence: number | null, mismatch: boolean) => ({ field: name, label, rules, jev, confidence, mismatch });

export const SAMPLE_JEV: ClassificationDisagreement[] = [
  {
    cache_key: "k1", company: "Stripe", title: "Software Engineer II, Payments", location: "Seattle", job_url: "https://example.com/job", truncated: false,
    completed_at: minutesAgo(30), kind: "rules_only", rules: { decision: "include", reason: null }, jev: { decision: "exclude", reason: "too_senior" },
    fields: [
      field("level", "Level", "new_grad", "mid", 0.82, true), field("location", "Location", "us", "us", 0.98, false), field("remote", "Remote", "no", "no", 0.95, false),
      field("degree", "Degree", "bachelors", "bachelors", 0.9, false), field("visa", "Visa", "unknown", "unknown", 0.6, false), field("internship", "Internship", "no", "no", 0.99, false),
    ],
    review: null,
  },
  {
    cache_key: "k2", company: "Ramp", title: "Data Analyst", location: "New York", job_url: null, truncated: false,
    completed_at: minutesAgo(50), kind: "jev_only", rules: { decision: "exclude", reason: "experience" }, jev: { decision: "include", reason: null },
    fields: [field("years", "Years", "3+", "0-2", 0.7, true), field("location", "Location", "us", "us", 0.98, false)],
    review: null,
  },
];

export const SAMPLE_TIERS: PollTierLatency[] = [
  { tier: 1, mode: "queue", target_interval_minutes: 5, sources: 60, overdue_sources: 0, poll_gap: { p50_minutes: 5, p95_minutes: 7, samples: 400 }, alert_delay: { p50_minutes: 4, p95_minutes: 7, samples: 120 }, estimated_p95_minutes: 7 },
  { tier: 2, mode: "cron", target_interval_minutes: 30, sources: 155, overdue_sources: 0, poll_gap: { p50_minutes: 30, p95_minutes: 38, samples: 900 }, alert_delay: { p50_minutes: 22, p95_minutes: 41, samples: 300 }, estimated_p95_minutes: 41 },
];

export const SAMPLE_METRICS: ProductMetrics = {
  period_days: 30, notification_latency_seconds: 360, notification_open_rate: 41, notifications_sent: 31_880, apply_clicks_within_one_hour: 96,
  eligible_job_dismissal_rate: 4, users_with_enough_matches: 184, total_profiles: 212, onboarding_completion_rate: 72, accounts_created: 27,
  push_registrations: 312, profile_adjustments: 38, tailoring_to_application_rate: 0,
  tailoring_quality: { sampleSize: 0, unsupportedClaimRate: 0, onePageRate: 0, deviceFailureRate: 0, ready: false, insufficientSample: true, failedGates: [] } as unknown as ProductMetrics["tailoring_quality"],
  open_reports: 2, open_feedback: 2, events: {},
};
