/** Auto-apply's server sends (step 10; docs/auto-apply-phase1-2026-10-24.md). */

export type ApplySendStatus =
  | "queued"
  | "running"
  | "submitting"
  /** Waiting for the code Greenhouse emailed. */
  | "code_needed"
  | "submitted"
  /** Submit was pressed but no confirmation showed. */
  | "unconfirmed"
  /** A dry run that would have sent. */
  | "ready"
  | "needs_you"
  /** A bot check or captcha: finish it on the phone. */
  | "blocked"
  | "gone"
  | "failed";

/** Who put an answer on the form. */
export type SentBy = "pinkslip" | "jev" | "site" | "page";

export interface SentAnswer {
  label: string;
  value: string;
  by: SentBy;
}

/** A question a send stopped on. With a ref and options it can be answered
 * in the app and the send started again; "error" is the form's own message. */
export interface SendNeed {
  ref?: string;
  label: string;
  kind: string;
  options?: string[];
  required?: boolean;
}

/** The resume a send uploads (`/apply/resume`). */
export interface ApplyResumeInfo {
  name: string;
  size: number;
  uploaded_at: string;
}

export interface ApplySend {
  id: string;
  job_id: string;
  company: string | null;
  title: string | null;
  ats: "greenhouse" | "ashby";
  url: string;
  dry_run: boolean;
  status: ApplySendStatus;
  detail: string | null;
  needs: SendNeed[];
  sent: SentAnswer[];
  form_shot: boolean;
  proof_shot: boolean;
  confirmation_text: string | null;
  confirmation_url: string | null;
  /** How far the fill has got, the resume counting as one; null until it
   * starts. Missing from servers before migration 0105. */
  progress?: { filled: number; of: number } | null;
  created_at: string;
  finished_at: string | null;
  /** A real send that stopped on questions waits until then, a day after it
   * stopped; null once dropped, and for everything else. Missing from
   * servers before migration 0110. */
  waiting_until?: string | null;
}

/** Sends that stopped on questions the person can answer in one sheet
 * (Paper "Stopped sends · Nov 4", W3 to W7). */
export interface WaitingSends {
  sends: Array<{ id: string; job_id: string; company: string; domain: string | null; title: string }>;
  /** Each asked once: a question two forms ask is one. */
  questions: WaitingQuestion[];
  /** The first of them lapses then. */
  until: string;
}

export interface WaitingQuestion {
  id: string;
  label: string;
  kind: string;
  options: string[];
  /** The companies asking it, for the step line. */
  companies: string[];
  /** Given already and kept until Send all. */
  answer: string | string[] | null;
}

/** Still going: queued, in the browser, or waiting for the emailed code. */
export const SEND_IN_PROGRESS: ReadonlySet<ApplySendStatus> = new Set(["queued", "running", "submitting", "code_needed"]);
