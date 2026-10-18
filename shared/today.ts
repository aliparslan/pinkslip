import type { Application } from "./application-stages";
import type { DetectedStage, InboundEmail } from "./email-tracking";
import type { OutreachThread } from "./outreach";

/**
 * Today in one request (GET /today; docs/backend-inventory-2026-10-16.md,
 * Decisions: Activity stream and Today #3). The server applies Today's rules
 * and sends the records each row is about; the apps word and lay out rows.
 */
export type TodayEntry =
  // Needs you
  | { kind: "offer_reply"; key: string; at: string; application: Application }
  | { kind: "interview_date"; key: string; at: string; application: Application }
  | { kind: "which_application"; key: string; at: string; email: InboundEmail; company_domain: string | null }
  | { kind: "follow_up_due"; key: string; at: string; thread: OutreachThread }
  // What changed (`new`: since Today was last opened, on any device)
  | { kind: "email_step"; key: string; at: string; application: Application; stage: DetectedStage; new: boolean }
  | { kind: "saved_job_closed"; key: string; at: string; application: Application; new: boolean }
  // Coming up
  | { kind: "upcoming_step"; key: string; at: string; application: Application }
  | { kind: "upcoming_follow_up"; key: string; at: string; thread: OutreachThread };

export interface TodayResponse {
  /** Newest first. */
  needs_you: TodayEntry[];
  /** The last 3 days, newest first. */
  changed: TodayEntry[];
  /** From today through the next 2 weeks in the person's time zone, soonest first. */
  coming_up: TodayEntry[];
  /** The app icon's badge: Needs you only (Decisions #4). */
  badge: number;
  /** When Today was last opened, on any device. */
  seen_at: string | null;
  /** Applications tracked, for the first-day empty state. */
  tracking: number;
}
