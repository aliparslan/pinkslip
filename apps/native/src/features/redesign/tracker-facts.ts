import type { Application, ApplicationStage } from "@pinkslip/core/api";
import { formatRowLocation } from "@pinkslip/core/job-format";
import type { StageGroup } from "../../ui/stage-group";
import { plainText } from "./job-facts";

/**
 * Tracker as the rows say it (Paper "Tracker · what we build now (TR2c)"):
 * applications grouped by stage in the order one moves, a quiet time, and a
 * third line built from what we know today. The goal for that line (the next
 * interview, the assessment's deadline, from email) is the board beside it.
 */

/** Saved → Closed, the way an application moves (owner, 2026-10-13). */
export const STAGE_GROUPS: readonly StageGroup[] = ["saved", "applied", "assessment", "interview", "offer", "closed"];

export const stageGroupLabels: Record<StageGroup, string> = {
  saved: "Saved",
  applied: "Applied",
  assessment: "Assessment",
  interview: "Interviewing",
  offer: "Offer",
  closed: "Closed",
};

/** The endings share Closed. */
export function groupOf(stage: ApplicationStage): StageGroup {
  return stage === "rejected" || stage === "withdrawn" || stage === "ghosted" ? "closed" : stage;
}

/** What each ending says on line three. */
const endings: Partial<Record<ApplicationStage, string>> = { rejected: "Rejected", withdrawn: "Withdrawn", ghosted: "No reply" };

/** The stages a row's menu can move it to, with the words it uses. */
export const MOVE_TO: readonly { stage: ApplicationStage; label: string }[] = [
  { stage: "saved", label: "Saved" },
  { stage: "applied", label: "Applied" },
  { stage: "assessment", label: "Assessment" },
  { stage: "interview", label: "Interviewing" },
  { stage: "offer", label: "Offer" },
  { stage: "rejected", label: "Rejected" },
  { stage: "withdrawn", label: "Withdrawn" },
  { stage: "ghosted", label: "No reply" },
];

const DAY_MS = 24 * 60 * 60 * 1000;

/** "Oct 2", with the year when it isn't this one. */
export function shortDate(iso: string, now = new Date()): string {
  const date = new Date(iso);
  const sameYear = date.getFullYear() === now.getFullYear();
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" }) });
}

/** When the application last moved: "now", "12m", "9h" within a day, then the date. */
export function trackerAge(iso: string, now = new Date()): string {
  const ms = now.getTime() - new Date(iso).getTime();
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  if (ms < DAY_MS) return `${Math.floor(minutes / 60)}h`;
  return shortDate(iso, now);
}

/** Line three: where, then when you applied once it's moved past Applied;
 * an ending says only how it ended. */
export function trackerFacts(application: Application, now = new Date()): string {
  const ending = endings[application.stage];
  if (ending) return ending;
  const place = formatRowLocation(application.job?.location);
  const group = groupOf(application.stage);
  const applied = group !== "saved" && group !== "applied" && application.applied_at ? `applied ${shortDate(application.applied_at, now)}` : null;
  return [place, applied].filter(Boolean).join(" · ");
}

export const companyName = (application: Application) => plainText(application.company_name);
export const jobTitle = (application: Application) => plainText(application.title);

/** Each stage's applications, the latest move first. */
export function groupApplications(applications: readonly Application[]): Map<StageGroup, Application[]> {
  const groups = new Map<StageGroup, Application[]>(STAGE_GROUPS.map((group) => [group, []]));
  for (const application of applications) groups.get(groupOf(application.stage))?.push(application);
  for (const list of groups.values()) list.sort((a, b) => b.stage_changed_at.localeCompare(a.stage_changed_at));
  return groups;
}

/** A stage on its own, split into this week and earlier. */
export function byWeek(applications: readonly Application[], now = new Date()): { title: string; applications: Application[] }[] {
  const weekAgo = now.getTime() - 7 * DAY_MS;
  const recent = applications.filter((application) => new Date(application.stage_changed_at).getTime() >= weekAgo);
  const earlier = applications.filter((application) => new Date(application.stage_changed_at).getTime() < weekAgo);
  return [{ title: "This week", applications: recent }, { title: "Earlier", applications: earlier }]
    .filter((section) => section.applications.length > 0);
}
