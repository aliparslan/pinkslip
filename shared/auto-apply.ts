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
  created_at: string;
  finished_at: string | null;
}

/** Still going: queued, in the browser, or waiting for the emailed code. */
export const SEND_IN_PROGRESS: ReadonlySet<ApplySendStatus> = new Set(["queued", "running", "submitting", "code_needed"]);
