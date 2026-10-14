import type { ApplicationStage } from "./application-stages";

/* Email tracking by forwarding: see docs/email-tracking.md. */

export const INBOX_LOCAL_PART = "inbox";
export const INBOX_DOMAIN = "pinkslip.work";

/** The user's forwarding address. */
export function inboxAddress(tag: string): string {
  return `${INBOX_LOCAL_PART}+${tag}@${INBOX_DOMAIN}`;
}

/** The steps an email can report. Saved, Withdrawn and Ghosted are the user's. */
export type DetectedStage = Extract<ApplicationStage, "applied" | "assessment" | "interview" | "offer" | "rejected">;

export const INBOUND_EMAIL_STATUSES = [
  "applied",
  "created",
  "unchanged",
  "needs_choice",
  "assigned",
  "dismissed",
  "undone",
] as const;

export type InboundEmailStatus = (typeof INBOUND_EMAIL_STATUSES)[number];

export interface Inbox {
  address: string;
  forwarding: {
    confirmed_at: string | null;
    /** Gmail's confirmation code and link while forwarding awaits confirmation. */
    code: string | null;
    link: string | null;
  };
  last_email_at: string | null;
}

export interface InboundEmail {
  id: string;
  received_at: string;
  sender_name: string;
  sender_address: string;
  subject: string;
  sent_at: string | null;
  detected_stage: DetectedStage;
  status: InboundEmailStatus;
  company_name: string | null;
  application_id: string | null;
  /** Filled while status is needs_choice. */
  candidates: { id: string; title: string; stage: ApplicationStage }[];
}
