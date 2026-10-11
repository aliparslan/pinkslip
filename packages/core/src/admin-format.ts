/* Admin wording and formatting shared by the web and iOS admin screens. Pure
   string work only, so it runs under React Native. */
import type { ClassificationCall, Company, ProductMetrics } from "./api";

/** Snake-case codes as words: "ambiguous_title_level" → "ambiguous title level". */
export const readableCode = (value: string) => value.replaceAll("_", " ");

/** Why the classifier sent a job to review. */
export const REVIEW_REASONS: Record<string, string> = {
  ambiguous_title_level: "Title level is ambiguous",
  experience_requirement_unparsed: "Experience requirement is unclear",
  advanced_degree_uncertain: "Doctorate may be required",
};

export function formatLatency(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)} sec`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} min`;
  return `${Math.round((seconds / 3600) * 10) / 10} hr`;
}

export function formatDuration(ms: number | null): string {
  const value = ms ?? 0;
  if (value < 1000) return `${value} ms`;
  if (value < 60_000) return `${Math.round(value / 100) / 10} sec`;
  return `${Math.floor(value / 60_000)} min ${Math.round((value % 60_000) / 1000)} sec`;
}

export function formatMinutes(value: number | null): string {
  if (value === null) return "—";
  if (value < 1) return "under 1 min";
  if (value < 60) return `${Math.round(value)} min`;
  const hours = Math.floor(value / 60);
  const minutes = Math.round(value % 60);
  return minutes === 0 ? `${hours} hr` : `${hours} hr ${minutes} min`;
}

export function friendlyPollError(value: string): string {
  return value
    .replace(/Request timed out after (\d+)ms/gi, (_match, ms: string) => `Timed out after ${Math.round(Number(ms) / 1000)} sec`)
    .replace(/\s+/g, " ")
    .trim();
}

export interface RunIssue { companyName?: string; error: string }

/** A run's `errors_json`: a list of {companyName, error}, or a bare string. */
export function parseRunIssues(value: string | null): RunIssue[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [{ error: friendlyPollError(value) }];
    return parsed
      .filter((issue): issue is Record<string, unknown> => Boolean(issue) && typeof issue === "object")
      .map((issue) => ({
        companyName: typeof issue.companyName === "string" ? issue.companyName : undefined,
        error: typeof issue.error === "string" ? friendlyPollError(issue.error) : "Unknown source error",
      }));
  } catch {
    return [{ error: friendlyPollError(value) }];
  }
}

const EXCLUSION_REASONS: Record<string, string> = {
  location: "outside the US",
  management: "management role",
  no_technical_signal: "not a technical role",
  non_technical_function: "not a technical role",
  other_engineering_discipline: "non-software engineering",
  seniority: "too senior",
  clearance: "needs a clearance",
};

/** One classifier's call on a job, as a short phrase. */
export function describeCall(call: ClassificationCall): string {
  if (call.decision === "include") return "Include";
  if (call.decision === "unsure") return "Unsure";
  return call.reason ? `Exclude · ${EXCLUSION_REASONS[call.reason] ?? readableCode(call.reason)}` : "Exclude";
}

export type SourceStatus = "active" | "attention" | "disabled" | "all";

export const SOURCE_STATUSES: { value: SourceStatus; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "attention", label: "Needs attention" },
  { value: "disabled", label: "Disabled" },
  { value: "all", label: "Any status" },
];

export const sourceNeedsAttention = (company: Company) => company.last_poll_status === "error" || Boolean(company.quarantined_at);

export function matchesSourceStatus(company: Company, status: SourceStatus): boolean {
  if (status === "active") return Boolean(company.enabled);
  if (status === "disabled") return !company.enabled;
  if (status === "attention") return sourceNeedsAttention(company);
  return true;
}

/** Name or ATS slug contains the query. */
export function matchesCompanyQuery(company: Company, query: string): boolean {
  const needle = query.trim().toLowerCase();
  return needle === "" || company.name.toLowerCase().includes(needle) || company.ats_slug.toLowerCase().includes(needle);
}

const ratio = (value: number) => `${Math.round(value * 1000) / 10}%`;

export type MetricRow = [label: string, value: string | number];

export interface MetricGroup {
  title: string;
  /** Shown instead of rows when the group has no activity. */
  empty: string;
  rows: MetricRow[] | null;
}

/** Product health for the admin overview, grouped as both apps show it. */
export function productHealthGroups(metrics: ProductMetrics): MetricGroup[] {
  const quality = metrics.tailoring_quality;
  const alerts = metrics.notification_latency_seconds > 0 || metrics.notification_open_rate > 0
    || metrics.notifications_sent > 0 || metrics.push_registrations > 0;
  const conversion = metrics.apply_clicks_within_one_hour > 0 || metrics.tailoring_to_application_rate > 0 || metrics.accounts_created > 0;
  return [
    { title: "Alerts", empty: "No alert activity in this period.", rows: alerts ? [
      ["Job to alert", formatLatency(metrics.notification_latency_seconds)],
      ["Alert open rate", `${metrics.notification_open_rate}%`],
      ["Alerts sent", metrics.notifications_sent],
      ["Devices registered", metrics.push_registrations],
    ] : null },
    { title: "Search quality", empty: "", rows: [
      ["Viable profiles", `${metrics.users_with_enough_matches}/${metrics.total_profiles}`],
      ["Onboarding completion", `${metrics.onboarding_completion_rate}%`],
      ["Eligible-job dismissals", `${metrics.eligible_job_dismissal_rate}%`],
      ["Profile changes", metrics.profile_adjustments],
    ] },
    { title: "Conversion", empty: "No conversion activity in this period.", rows: conversion ? [
      ["Quick apply clicks", metrics.apply_clicks_within_one_hour],
      ["Tailor to apply", `${metrics.tailoring_to_application_rate}%`],
      ["New accounts", metrics.accounts_created],
    ] : null },
    { title: "Tailoring quality", empty: "No PDFs evaluated yet.", rows: quality.sampleSize > 0 ? [
      ["Evaluated PDFs", `${quality.sampleSize}/20`],
      ["Unsupported claims", ratio(quality.unsupportedClaimRate)],
      ["One-page PDFs", ratio(quality.onePageRate)],
      ["Device compile failures", ratio(quality.deviceFailureRate)],
      ["Supervised beta gate", quality.ready ? "Ready" : quality.insufficientSample ? "Collecting data" : "Blocked"],
    ] : null },
    { title: "Inbox", empty: "Inbox is clear.", rows: metrics.open_feedback > 0 || metrics.open_reports > 0 ? [
      ["Active feedback", metrics.open_feedback],
      ["Open reports", metrics.open_reports],
    ] : null },
  ];
}
