import { friendlyPollError, sourceNeedsAttention } from "@pinkslip/core/admin-format";
import type { ClassificationDisagreement, Company, FeedbackSubmission, ContentReport, FetchRun, JobReview, PollTierLatency } from "@pinkslip/core/api";

/**
 * What Admin says, worked out from its data (owner, 2026-10-16, Paper
 * "Admin · Oct 16"). Plain functions so the screens and their samples read
 * the same way and the wording can be tested.
 */

const DAY = 86_400_000;
const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

/** "12 min ago", "3 hr ago", "yesterday", "Oct 14". */
export function ago(iso: string, now: number): string {
  const minutes = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  if (hours < 48) return "yesterday";
  return shortDate(iso);
}

/** A row's age, as the Jobs feed writes it: 12m, 3h, Oct 14. */
export function rowAge(iso: string, now: number): string {
  const minutes = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60_000));
  if (minutes < 60) return `${Math.max(1, minutes)}m`;
  if (minutes < 60 * 24) return `${Math.floor(minutes / 60)}h`;
  return shortDate(iso);
}

export const shortDate = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });

/** The home card (A1): the last 24 hours, read from the runs. */
export function lastDay(runs: FetchRun[], now: number) {
  const recent = runs.filter((run) => now - new Date(run.started_at).getTime() < DAY);
  return {
    newJobs: recent.reduce((sum, run) => sum + run.new_jobs_found, 0),
    alerts: recent.reduce((sum, run) => sum + run.notifications_sent, 0),
    runs: recent.length,
  };
}

export type Health = "good" | "bad" | "running";

/** The line under the home card's numbers: how the last run went. */
export function runLine(run: FetchRun | undefined, now: number): { health: Health; text: string } | null {
  if (!run) return null;
  if (run.status === "running") return { health: "running", text: `Running since ${ago(run.started_at, now)}` };
  return {
    health: run.companies_failed > 0 || run.status === "error" ? "bad" : "good",
    text: `Last run ${ago(run.started_at, now)} · ${run.companies_succeeded} of ${run.companies_attempted} sources`,
  };
}

/** Sources that need you, the longest broken first. */
export function failingSources(companies: Company[]): Company[] {
  return companies.filter(sourceNeedsAttention).sort((a, b) => (a.quarantined_at ?? a.last_polled_at ?? "").localeCompare(b.quarantined_at ?? b.last_polled_at ?? ""));
}

/** What went wrong with a source, in a few words: "Board moved · since Oct 14". */
export function sourceProblem(company: Company): string {
  const error = company.last_poll_error ? friendlyPollError(company.last_poll_error) : "Didn't load";
  const short = /404|not found/i.test(error) ? "Board moved" : /timed out/i.test(error) ? "Timed out" : error.split(/[.:]/)[0]!.slice(0, 40);
  if (company.quarantined_at) return `Paused after ${plural(company.poll_failure_count ?? 5, "failure")} · since ${shortDate(company.quarantined_at)}`;
  return short;
}

/** A source row's third line (A6): what's wrong, that it's off, or when it was checked. */
export function sourceStatus(company: Company, now: number): { text: string; tone: "bad" | "quiet" | "normal" } {
  if (sourceNeedsAttention(company)) return { text: sourceProblem(company), tone: "bad" };
  if (!company.enabled) return { text: "Off", tone: "quiet" };
  return { text: company.last_polled_at ? `Checked ${ago(company.last_polled_at, now)}` : "Not checked yet", tone: "normal" };
}

export interface NeedsYouRow {
  id: "sources" | "flagged" | "feedback" | "reports" | "jev" | "recruiters";
  title: string;
  detail: string;
}

/** Home's Needs you (A1): the thing to do as a verb, the newest one under it. Empty lists leave. */
export function needsYou(input: {
  failing: Company[];
  flagged: { total: number; newest?: JobReview };
  feedback: FeedbackSubmission[];
  reports: ContentReport[];
  jevOpen: number;
  toLabel: { count: number; companies: string[] };
}): NeedsYouRow[] {
  const rows: NeedsYouRow[] = [];
  const { failing, flagged, feedback, reports, jevOpen, toLabel } = input;
  if (failing.length > 0) rows.push({ id: "sources", title: `Fix ${plural(failing.length, "source")}`, detail: `${failing[0]!.name} · ${sourceProblem(failing[0]!).toLowerCase()}` });
  if (flagged.total > 0) {
    const newest = flagged.newest;
    rows.push({ id: "flagged", title: `Review ${plural(flagged.total, "flagged job")}`, detail: newest ? `${newest.company_name} · ${newest.title}` : "Jobs the rules weren't sure about" });
  }
  if (feedback.length > 0) {
    const newest = feedback[0]!;
    rows.push({ id: "feedback", title: `Read ${plural(feedback.length, "note")} from people`, detail: `${newest.user_name || "Someone"} · "${newest.title}"` });
  }
  if (reports.length > 0) {
    const newest = reports[0]!;
    rows.push({ id: "reports", title: `Settle ${plural(reports.length, "report")}`, detail: [newest.company_name, newest.notes ? `"${newest.notes}"` : newest.job_title].filter(Boolean).join(" · ") });
  }
  if (jevOpen > 0) rows.push({ id: "jev", title: `Judge ${plural(jevOpen, "Jev call")}`, detail: "Where the rules and Jev disagree" });
  if (toLabel.count > 0) {
    const names = toLabel.companies.slice(0, 2);
    const more = toLabel.companies.length - names.length;
    rows.push({ id: "recruiters", title: `Label ${plural(toLabel.count, "recruiter")}`, detail: more > 0 ? `${names.join(", ")} and ${more} more` : names.join(" and ") });
  }
  return rows;
}

/** A flagged job's reasons as words (A2's third line, A3's rows). */
export const FLAG_REASONS: Record<string, string> = {
  ambiguous_title_level: "Level unclear",
  experience_requirement_unparsed: "Experience unclear",
  advanced_degree_uncertain: "Might need a doctorate",
};

export function flagReasons(review: JobReview): string[] {
  return review.reason_codes.map((code) => FLAG_REASONS[code] ?? code.replace(/_/g, " ").replace(/^./, (letter) => letter.toUpperCase()));
}

/** A poll tier as a row (A5): "Every 5 minutes", worst case, or how many are overdue. */
export function tierRow(tier: PollTierLatency): { label: string; value: string; bad: boolean } {
  const minutes = tier.target_interval_minutes;
  const label = minutes < 60 ? `Every ${plural(minutes, "minute")}` : `Every ${plural(Math.round(minutes / 60), "hour")}`;
  if (tier.overdue_sources > 0) return { label, value: `${tier.overdue_sources} overdue`, bad: true };
  const worst = tier.estimated_p95_minutes ?? tier.alert_delay.p95_minutes;
  return { label, value: worst === null ? "—" : worst < 60 ? `${Math.round(worst)} min` : `${Math.round(worst / 60)} hr`, bad: false };
}

/** "1:52" for a run's length. */
export function runLength(ms: number | null): string {
  const seconds = Math.round((ms ?? 0) / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/** Jev (A4): only the fields where the two disagree; the rest are counted. */
export function jevDifferences(row: ClassificationDisagreement) {
  const differ = row.fields.filter((field) => field.mismatch);
  return { differ, same: row.fields.length - differ.length };
}

/** A call in a word: Keep, Skip or Unsure. */
export const callWord = (decision: "include" | "exclude" | "unsure") => (decision === "include" ? "Keep" : decision === "exclude" ? "Skip" : "Unsure");

/** What the posting said for each reason (A3): "Level unclear · Engineer II". */
export function flagEvidence(review: JobReview): [string, string][] {
  const evidence = review.evidence ?? {};
  return review.reason_codes.map((code) => {
    const label = FLAG_REASONS[code] ?? code.replace(/_/g, " ").replace(/^./, (letter) => letter.toUpperCase());
    // The title is already on the page, so only a level the rules read out.
    if (code === "ambiguous_title_level") return [label, evidence.seniority ?? ""];
    if (code === "experience_requirement_unparsed") return [label, evidence.min_years != null ? `${evidence.min_years}+ years` : "Not stated"];
    if (code === "advanced_degree_uncertain") return [label, evidence.requires_advanced_degree ? "Looks required" : "Unclear"];
    return [label, ""];
  });
}
