/**
 * Where an application stands. One application per tracked job: it starts at
 * whichever stage the user first records (often Saved, sometimes straight at
 * Applied) and only ever appears in one place.
 */
export const APPLICATION_STAGES = [
  "saved",
  "applied",
  "assessment",
  "interview",
  "offer",
  "rejected",
  "withdrawn",
  "ghosted",
] as const;

export type ApplicationStage = (typeof APPLICATION_STAGES)[number];

/** Endings close an application; the rest move forward in order. */
export const ENDING_APPLICATION_STAGES: readonly ApplicationStage[] = ["rejected", "withdrawn", "ghosted"];

export const APPLICATION_STAGE_LABELS: Record<ApplicationStage, string> = {
  saved: "Saved",
  applied: "Applied",
  assessment: "Assessment",
  interview: "Interview",
  offer: "Offer",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
  ghosted: "Ghosted",
};

/** Who recorded a step: the user, or an email they forwarded. Automation
 * reports here later. */
export type ApplicationEventSource = "user" | "email" | "auto_apply";

export const APPLICATION_NOTES_MAX_LENGTH = 10_000;

export function isApplicationStage(value: unknown): value is ApplicationStage {
  return typeof value === "string" && (APPLICATION_STAGES as readonly string[]).includes(value);
}

/** Every stage after Saved, endings included, means the user applied. */
export function hasApplied(stage: ApplicationStage): boolean {
  return stage !== "saved";
}

export function isEndingStage(stage: ApplicationStage): boolean {
  return ENDING_APPLICATION_STAGES.includes(stage);
}

/** Stages with a date of their own: when you'll hear back, when the
 * assessment is due, when the interview is, when to answer the offer. */
export const DATED_APPLICATION_STAGES: readonly ApplicationStage[] = ["applied", "assessment", "interview", "offer"];

export function takesStageDate(stage: ApplicationStage): boolean {
  return DATED_APPLICATION_STAGES.includes(stage);
}

const CALENDAR_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** A stage date as stored: a real calendar day stays "YYYY-MM-DD"; anything
 * with a time becomes an ISO instant. Null when it's neither. */
export function normalizeStageDate(value: string): string | null {
  const day = CALENDAR_DAY.exec(value);
  if (day) {
    const [, year, month, date] = day.map(Number);
    const parsed = new Date(Date.UTC(year!, month! - 1, date!));
    return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month! - 1 && parsed.getUTCDate() === date
      ? value
      : null;
  }
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) return null;
  const millis = Date.parse(value);
  return Number.isNaN(millis) ? null : new Date(millis).toISOString();
}

export interface ApplicationEvent {
  id: string;
  /** The stage the application entered. */
  stage: ApplicationStage;
  source: ApplicationEventSource;
  occurred_at: string;
  /** The email behind an email-detected step, for "Not right?". */
  inbound_email_id: string | null;
  /** That email's subject, so the step can say which email it was. */
  email_subject: string | null;
}

export interface Application {
  id: string;
  /** Null when the job left the catalog after tracking, or for an
   * application added by hand (company, title and an optional link). */
  job_id: string | null;
  company_name: string;
  title: string;
  url: string;
  stage: ApplicationStage;
  notes: string;
  /** When it first reached Applied or later; null while Saved. */
  applied_at: string | null;
  stage_changed_at: string;
  /** The date that goes with the stage (see DATED_APPLICATION_STAGES): a
   * calendar day ("2026-10-15") or an ISO instant when the time is known.
   * Null when there isn't one; changing the stage clears it. */
  stage_date: string | null;
  created_at: string;
  updated_at: string;
  job: {
    location: string;
    closed_at: string | null;
    company_domain: string;
  } | null;
  /** The company's site, kept on the application so its logo outlives the
   * job (and found in the catalog for one added by hand). */
  company_domain?: string | null;
  /** The job's pay as it was listed, kept on the application. */
  salary?: string | null;
  /** "email" when the stage's date came from an email ("from the email"). */
  stage_date_source?: "email" | null;
}

/** Limits for an application added by hand. */
export const MANUAL_APPLICATION_LIMITS = { company: 120, title: 200, url: 2000 } as const;

export interface ApplicationDetail extends Application {
  /** Oldest first. */
  events: ApplicationEvent[];
}
