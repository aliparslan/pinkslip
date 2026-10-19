export type OutreachThreadStatus = "draft" | "active" | "replied" | "stopped" | "finished";
export type OutreachMessageStatus = "draft" | "scheduled" | "sent" | "skipped";
export type OutreachStep = 0 | 1 | 2;

export interface OutreachMessage {
  id: string;
  /** 0 is the first email; 1 and 2 are follow-ups. */
  step: OutreachStep;
  subject: string;
  body: string;
  status: OutreachMessageStatus;
  due_at: string | null;
  sent_at: string | null;
}

export interface OutreachContact {
  name: string;
  email: string;
  title: string;
  /** Addressed to the stand-in (OUTREACH_TEST_RECIPIENT), not the real recruiter. */
  test: boolean;
  /** Their LinkedIn profile, for a recruiter the sourcing search found. */
  linkedin_url?: string | null;
}

/** Someone on a company's People (Paper O1): a listed recruiter, or anyone
 * you've written to there. The address comes with their page. */
export interface CompanyPerson {
  /** The contact's id: POST /outreach/threads { contact_id } opens their page. */
  id: string;
  name: string;
  title: string;
  linkedin_url: string | null;
  /** Your thread with them; first_sent_at puts the paper plane on the row. */
  thread: { id: string; status: OutreachThreadStatus; first_sent_at: string | null } | null;
}

export interface OutreachThread {
  id: string;
  status: OutreachThreadStatus;
  job_id: string | null;
  job_title: string | null;
  company_id: string;
  company_name: string;
  contact: OutreachContact;
  messages: OutreachMessage[];
  created_at: string;
  updated_at: string;
}

/** The message to act on next: the unsent draft or the earliest pending follow-up. */
export function nextOutreachMessage(thread: OutreachThread): OutreachMessage | null {
  if (thread.status !== "draft" && thread.status !== "active") return null;
  return thread.messages.find((message) => message.status === "draft" || message.status === "scheduled")
    ?? null;
}

/** A mailto: link that opens the user's own mail app with the message filled in. */
export function outreachMailtoUrl(to: string, message: Pick<OutreachMessage, "subject" | "body">): string {
  const query = [
    `subject=${encodeURIComponent(message.subject)}`,
    `body=${encodeURIComponent(message.body)}`,
  ].join("&");
  return `mailto:${encodeURIComponent(to).replace(/%40/g, "@")}?${query}`;
}

export type WebMail = "gmail" | "outlook";

/** The same message in Gmail's or Outlook's web compose window, for someone
 * whose mail lives in a browser rather than a mail app (Decisions: Outreach
 * #6). Outlook's is for personal accounts (outlook.com, hotmail). */
export function outreachComposeUrl(app: WebMail, to: string, message: Pick<OutreachMessage, "subject" | "body">): string {
  const params = app === "gmail"
    ? new URLSearchParams({ view: "cm", fs: "1", to, su: message.subject, body: message.body })
    : new URLSearchParams({ to, subject: message.subject, body: message.body });
  // URLSearchParams writes spaces as "+", which some compose windows keep.
  const query = params.toString().replace(/\+/g, "%20");
  return app === "gmail"
    ? `https://mail.google.com/mail/?${query}`
    : `https://outlook.live.com/mail/0/deeplink/compose?${query}`;
}
