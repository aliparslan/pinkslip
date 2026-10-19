import { takesStageDate, type ApplicationDetail, type ApplicationStage } from "@pinkslip/domain/application-stages";

/** One step stamped on an application's stub: the stage it reached and when. */
export interface Stamp {
  stage: ApplicationStage;
  /** "INTERVIEWING", as printed. */
  label: string;
  /** "OCT 12". */
  date: string;
  /** The email that recorded it, for "Not right?". */
  email: { id: string; subject: string } | null;
  /** The timeline step, whose date can be fixed; none for an application
   * from before the timeline. */
  eventId: string | null;
  /** When it happened, for the calendar. */
  occurredAt: string;
}

const stampLabels: Record<ApplicationStage, string> = {
  saved: "SAVED",
  applied: "APPLIED",
  assessment: "ASSESSMENT",
  interview: "INTERVIEWING",
  offer: "OFFER",
  rejected: "REJECTED",
  withdrawn: "WITHDRAWN",
  ghosted: "GHOSTED",
};

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

/**
 * The stub's stamps, oldest first: the road to where the application stands.
 * Saved isn't stamped (the stub only exists once you've applied). Moving back
 * to a stage drops what came after it, so a mistaken tap doesn't stay printed.
 */
export function stubStamps(application: ApplicationDetail): Stamp[] {
  const stamps: Stamp[] = [];
  for (const event of application.events) {
    if (event.stage === "saved") {
      stamps.length = 0;
      continue;
    }
    const earlier = stamps.findIndex((stamp) => stamp.stage === event.stage);
    if (earlier >= 0) stamps.length = earlier;
    const when = new Date(event.occurred_at);
    stamps.push({
      stage: event.stage,
      label: stampLabels[event.stage],
      date: `${MONTHS[when.getMonth()]} ${when.getDate()}`,
      email: event.source === "email" && event.inbound_email_id
        ? { id: event.inbound_email_id, subject: event.email_subject ?? "" }
        : null,
      eventId: event.id,
      occurredAt: event.occurred_at,
    });
  }
  // Applications from before the timeline have no events.
  if (stamps.length === 0 && application.stage !== "saved") {
    const when = new Date(application.applied_at ?? application.stage_changed_at);
    stamps.push({ stage: application.stage, label: stampLabels[application.stage], date: `${MONTHS[when.getMonth()]} ${when.getDate()}`, email: null,
      eventId: null, occurredAt: when.toISOString() });
  }
  return stamps;
}

/**
 * An application Pinkslip sent (Paper "6 · After: proof it went through").
 * The backend doesn't record sends yet, so only the kit's samples carry one.
 */
export interface SentProof {
  /** The board it went through: "Greenhouse". */
  via: string;
  /** What confirmed it arrived, and when; null while it waits. */
  confirmed: { by: "email" | "board"; at: string } | null;
}

/** "9:58 AM" on the day it was sent, "Oct 15, 9:58 AM" after. */
function confirmedWhen(at: string, sentOn: string | null): string {
  const when = new Date(at);
  const time = when.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const sameDay = sentOn !== null && new Date(sentOn).toDateString() === when.toDateString();
  return sameDay ? time : `${when.toLocaleDateString("en-US", { month: "short", day: "numeric" })}, ${time}`;
}

/**
 * The stub of an application Pinkslip sent: APPLIED once the board or the
 * company's email confirms it, until then a quiet dashed SENT ("No guessing:
 * it waits for proof"). The aside says which, the foot says Pinkslip sent it.
 * A later step is proof enough, so only a lone Applied stamp waits.
 */
export function sentStub(application: ApplicationDetail, proof: SentProof, stamps: Stamp[]) {
  const waiting = proof.confirmed === null && stamps.length === 1 && stamps[0]!.stage === "applied";
  const by = proof.confirmed?.by === "board" ? proof.via : `${application.company_name}'s email`;
  return {
    waiting,
    aside: waiting
      ? { title: `Waiting for ${application.company_name}`, detail: "to confirm it arrived" }
      : proof.confirmed && stamps.length === 1
        ? { title: "Confirmed", detail: `by ${by}, ${confirmedWhen(proof.confirmed.at, application.applied_at)}` }
        : null,
    foot: `Sent by Pinkslip · via ${proof.via}`,
  };
}

/** The Next row's headline, by the stage the date belongs to. */
export const stageDateTitles: Partial<Record<ApplicationStage, string>> = {
  applied: "Hear back by",
  assessment: "Assessment due",
  interview: "Interview",
  offer: "Reply to the offer by",
};

/** The date step's question. */
/** Fixing a step's date (a stamp on your stub; owner, 2026-10-19, Paper
 * "Step dates · Oct 19"): the question each step asks. */
export const stepDatePrompts: Record<ApplicationStage, string> = {
  saved: "When did you save it?",
  applied: "When did you apply?",
  assessment: "When did it arrive?",
  interview: "When did interviews start?",
  offer: "When did the offer come?",
  rejected: "When did you hear?",
  withdrawn: "When did you withdraw?",
  ghosted: "When did they go quiet?",
};

/** What an email's step was, for the line under its question ("The
 * assessment, from Mercury's email"). */
export const stepNouns: Record<ApplicationStage, string> = {
  saved: "The save",
  applied: "Your application",
  assessment: "The assessment",
  interview: "The interview",
  offer: "The offer",
  rejected: "The answer",
  withdrawn: "Withdrawing",
  ghosted: "The silence",
};

export const stageDatePrompts: Partial<Record<ApplicationStage, string>> = {
  applied: "When will you hear back?",
  assessment: "When's it due?",
  interview: "When's the interview?",
  offer: "When do you need to reply?",
};

/** The row when a dated stage has no date yet. Applied has none: most people
 * never get a date, so it's in the ⋯ menu instead. */
export const addStageDateLabels: Partial<Record<ApplicationStage, string>> = {
  assessment: "Add the due date",
  interview: "Add the interview date",
  offer: "Add the reply-by date",
};

/** An interview has a time; the other dates are a day. */
export function stageDateHasTime(stage: ApplicationStage): boolean {
  return stage === "interview";
}

/** Stages that ask for their date as soon as you move to them. */
export function asksForDate(stage: ApplicationStage): boolean {
  return takesStageDate(stage) && stage !== "applied";
}

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** A stored stage date as a local Date: a calendar day is that day's start
 * where you are, not midnight UTC. */
export function stageDateValue(value: string): Date {
  const day = DAY.exec(value);
  return day ? new Date(Number(day[1]), Number(day[2]) - 1, Number(day[3])) : new Date(value);
}

/** What the app sends: the day alone ("2026-10-15"), or the instant with a time. */
export function stageDateToSend(date: Date, withTime: boolean): string {
  if (withTime) return date.toISOString();
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export interface NextRowFacts {
  /** The date tile: "OCT" over "15". */
  month: string;
  day: string;
  /** "Thursday", "Today" or "Tomorrow"; "Thursday, Oct 22" past the next week. */
  when: string;
  /** "11:00 AM", or null for a day. */
  time: string | null;
}

/** The Next row's facts for a stage date, as of `now`. */
export function nextRowFacts(value: string, now: Date = new Date()): NextRowFacts {
  const date = stageDateValue(value);
  const startOf = (day: Date) => new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime();
  const days = Math.round((startOf(date) - startOf(now)) / 86_400_000);
  const weekday = WEEKDAYS[date.getDay()]!;
  const month = MONTHS[date.getMonth()]!;
  const when = days === 0 ? "Today"
    : days === 1 ? "Tomorrow"
    : days > 1 && days < 7 ? weekday
    : `${weekday}, ${month.charAt(0)}${month.slice(1).toLowerCase()} ${date.getDate()}`;
  const time = DAY.test(value) ? null : date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return { month, day: String(date.getDate()), when, time };
}

/** "15 days" since you applied, under a lone APPLIED stamp; null within a day. */
export function daysSinceApplied(appliedAt: string | null, now: Date = new Date()): string | null {
  if (!appliedAt) return null;
  const days = Math.floor((now.getTime() - new Date(appliedAt).getTime()) / 86_400_000);
  return days < 1 ? null : days === 1 ? "1 day" : `${days} days`;
}
