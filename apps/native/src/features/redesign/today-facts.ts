import type { Application } from "@pinkslip/core/api";
import { isEndingStage } from "@pinkslip/domain/application-stages";
import type { DetectedStage, InboundEmail } from "@pinkslip/domain/email-tracking";
import type { OutreachThread } from "@pinkslip/domain/outreach";
import { nextRowFacts, stageDateValue, type NextRowFacts } from "./application-facts";
import { plainText } from "./job-facts";
import { firstSentAt, nextFollowUp } from "./outreach/outreach-facts";
import { companyName, jobTitle, shortDate, trackerAge } from "./tracker-facts";

/**
 * Today at release (Paper "Approved", T1r and T3r; docs/redesign-wireframes.md,
 * "Today on the current kit"): what needs you, what changed while you were
 * away, and what's coming up. Built from what the app already loads, the
 * applications and the emails email tracking filed, until the backend has an
 * activity feed. Auto-apply's card and follow-ups come with their features.
 */

export type TodayTarget =
  | { kind: "application"; id: string }
  | { kind: "job"; id: string }
  | { kind: "email"; email: InboundEmail }
  | { kind: "person"; id: string };

export interface TodayItem {
  key: string;
  /** Line one: the company, or Coming up's day ("Friday"). */
  company: string;
  /** Line two, the one dark line: the thing to do or the news. */
  headline: string;
  /** Line three. */
  facts: string;
  /** Trailing on line one: how long ago, or Coming up's time. */
  trailing?: string;
  /** The logo, or Coming up's date tile. */
  logo?: { name: string; domain?: string | null };
  date?: Pick<NextRowFacts, "month" | "day">;
  target: TodayTarget;
  /** When it happened or happens, for ordering. */
  at: number;
}

export interface TodayPlan {
  needsYou: TodayItem[];
  changed: TodayItem[];
  comingUp: TodayItem[];
}

/** What changed looks back this far: a weekend away still sees Friday's news. */
const CHANGED_DAYS = 3;
/** Coming up looks ahead two weeks. */
const AHEAD_DAYS = 14;
const DAY_MS = 86_400_000;

/** What an email's step says as news. */
const NEWS: Record<DetectedStage, string> = {
  applied: "Application received",
  assessment: "Assessment sent",
  interview: "Interview invite",
  offer: "Offer",
  rejected: "Not moving forward",
};

function logoOf(application: Application) {
  return { name: application.company_name, domain: application.job?.company_domain };
}

function applicationTarget(application: Application): TodayTarget {
  // A saved job has no stub yet; it opens the job.
  return application.stage === "saved" && application.job_id
    ? { kind: "job", id: application.job_id }
    : { kind: "application", id: application.id };
}

/** Needs you: an offer to answer, an interview with no date, an email
 * that matched more than one application. Newest first. */
function needsYou(applications: readonly Application[], emails: readonly InboundEmail[], now: Date): TodayItem[] {
  const rows: TodayItem[] = [];
  for (const application of applications) {
    const at = Date.parse(application.stage_changed_at);
    const base = { company: companyName(application), logo: logoOf(application), target: applicationTarget(application), at, trailing: trackerAge(application.stage_changed_at, now) };
    if (application.stage === "offer") {
      const by = application.stage_date ? `by ${shortDate(stageDateValue(application.stage_date).toISOString(), now)}` : null;
      rows.push({ ...base, key: `offer-${application.id}`, headline: "Reply to the offer", facts: [jobTitle(application), by].filter(Boolean).join(" · ") });
    } else if (application.stage === "interview" && !application.stage_date) {
      rows.push({ ...base, key: `date-${application.id}`, headline: "Add the interview date", facts: jobTitle(application) });
    }
  }
  const byId = new Map(applications.map((application) => [application.id, application]));
  for (const email of emails) {
    if (email.status !== "needs_choice") continue;
    // The logo of the company it's from, through the applications it matched.
    const match = email.candidates.map((candidate) => byId.get(candidate.id)).find(Boolean);
    rows.push({
      key: `email-${email.id}`,
      company: plainText(email.company_name ?? email.sender_name),
      headline: "Which application is this?",
      facts: plainText(email.subject),
      trailing: trackerAge(email.received_at, now),
      logo: match ? logoOf(match) : { name: email.company_name ?? email.sender_name },
      target: { kind: "email", email },
      at: Date.parse(email.received_at),
    });
  }
  return rows.sort((a, b) => b.at - a.at);
}

/** What changed: steps email tracking filed, and saved postings that closed,
 * in the last few days. Your own moves aren't news. Newest first. */
function changed(applications: readonly Application[], emails: readonly InboundEmail[], now: Date, skip: ReadonlySet<string>): TodayItem[] {
  const since = now.getTime() - CHANGED_DAYS * DAY_MS;
  const byId = new Map(applications.map((application) => [application.id, application]));
  const rows: TodayItem[] = [];
  const seen = new Set<string>();
  for (const email of emails) {
    if (email.status !== "applied" && email.status !== "created") continue;
    const at = Date.parse(email.received_at);
    const application = email.application_id ? byId.get(email.application_id) : undefined;
    if (at < since || !application || skip.has(application.id) || seen.has(application.id)) continue;
    // One row per application: its latest email.
    seen.add(application.id);
    rows.push({
      key: `changed-${email.id}`,
      company: companyName(application),
      headline: NEWS[email.detected_stage],
      facts: jobTitle(application),
      trailing: trackerAge(email.received_at, now),
      logo: logoOf(application),
      target: applicationTarget(application),
      at,
    });
  }
  for (const application of applications) {
    const closed = application.job?.closed_at;
    if (application.stage !== "saved" || !closed || Date.parse(closed) < since) continue;
    rows.push({
      key: `closed-${application.id}`,
      company: companyName(application),
      headline: "Posting closed",
      facts: `${jobTitle(application)} · you saved it`,
      trailing: trackerAge(closed, now),
      logo: logoOf(application),
      target: applicationTarget(application),
      at: Date.parse(closed),
    });
  }
  return rows.sort((a, b) => b.at - a.at);
}

/** What each dated stage says in Coming up. */
function upcomingHeadline(application: Application): string | null {
  const company = companyName(application);
  if (application.stage === "interview") return `${company} interview`;
  if (application.stage === "assessment") return `${company} assessment due`;
  if (application.stage === "applied") return `Hear back from ${company}`;
  return null;
}

/** Coming up: dated steps from today through the next two weeks, soonest first. */
function comingUp(applications: readonly Application[], now: Date): TodayItem[] {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const rows: TodayItem[] = [];
  for (const application of applications) {
    if (!application.stage_date || isEndingStage(application.stage)) continue;
    const headline = upcomingHeadline(application);
    const at = stageDateValue(application.stage_date).getTime();
    if (!headline || at < today || at >= today + (AHEAD_DAYS + 1) * DAY_MS) continue;
    const facts = nextRowFacts(application.stage_date, now);
    rows.push({
      key: `upcoming-${application.id}`,
      company: facts.when,
      headline,
      facts: jobTitle(application),
      trailing: facts.time ?? "All day",
      date: { month: facts.month, day: facts.day },
      target: applicationTarget(application),
      at,
    });
  }
  return rows.sort((a, b) => a.at - b.at);
}

/** O6: a follow-up that's due needs you; a planned one is coming up. */
function followUps(threads: readonly OutreachThread[], now: Date): { due: TodayItem[]; planned: TodayItem[] } {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const due: TodayItem[] = [];
  const planned: TodayItem[] = [];
  for (const thread of threads) {
    const next = nextFollowUp(thread);
    if (!next?.due_at) continue;
    const at = Date.parse(next.due_at);
    const base = { headline: `Follow up with ${thread.contact.name}`, logo: { name: thread.company_name }, target: { kind: "person" as const, id: thread.id } };
    if (at <= now.getTime()) {
      const sent = firstSentAt(thread);
      due.push({ ...base, key: `follow-${thread.id}`, company: plainText(thread.company_name), at, trailing: trackerAge(next.due_at, now),
        facts: [sent ? `No reply since ${shortDate(sent, now)}` : null, "the note is ready"].filter(Boolean).join(" · ") });
    } else if (at < today + (AHEAD_DAYS + 1) * DAY_MS) {
      const facts = nextRowFacts(next.due_at, now);
      planned.push({ ...base, key: `planned-${thread.id}`, company: facts.when, at, trailing: facts.time ?? "All day",
        date: { month: facts.month, day: facts.day }, facts: [plainText(thread.company_name), thread.job_title].filter(Boolean).join(" · ") });
    }
  }
  return { due, planned };
}

export function planToday(applications: readonly Application[], emails: readonly InboundEmail[], now = new Date(), threads: readonly OutreachThread[] = []): TodayPlan {
  const outreach = followUps(threads, now);
  const waiting = [...needsYou(applications, emails, now), ...outreach.due].sort((a, b) => b.at - a.at);
  const skip = new Set(waiting.flatMap((item) => item.target.kind === "application" ? [item.target.id] : []));
  return {
    needsYou: waiting,
    changed: changed(applications, emails, now, skip),
    comingUp: [...comingUp(applications, now), ...outreach.planned].sort((a, b) => a.at - b.at),
  };
}
