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
export type ApplicationEventSource = "user" | "email";

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

export interface ApplicationEvent {
  id: string;
  /** The stage the application entered. */
  stage: ApplicationStage;
  source: ApplicationEventSource;
  occurred_at: string;
  /** The email behind an email-detected step, for "Not right?". */
  inbound_email_id: string | null;
}

export interface Application {
  id: string;
  /** Null only when the job was removed from the catalog after tracking. */
  job_id: string | null;
  company_name: string;
  title: string;
  url: string;
  stage: ApplicationStage;
  notes: string;
  /** When it first reached Applied or later; null while Saved. */
  applied_at: string | null;
  stage_changed_at: string;
  created_at: string;
  updated_at: string;
  job: {
    location: string;
    closed_at: string | null;
    company_domain: string;
  } | null;
}

export interface ApplicationDetail extends Application {
  /** Oldest first. */
  events: ApplicationEvent[];
}
