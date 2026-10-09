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
  /** A stand-in recipient (OUTREACH_TEST_RECIPIENT), not a real recruiter. */
  test: boolean;
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
