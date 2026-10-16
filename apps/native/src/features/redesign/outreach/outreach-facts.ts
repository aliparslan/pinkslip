import type { OutreachMessage, OutreachThread } from "@pinkslip/domain/outreach";
import { shortDate } from "../tracker-facts";

/**
 * Outreach as the screens say it (owner, 2026-10-15, Paper "Outreach ·
 * Oct 15"): a person's emails (O5), Tracker's line three (O7) and Today's
 * follow-ups (O6). Follow-ups are two at most and stop once they reply.
 */

/** "DW" for Dana Whitfield: people get a round avatar of initials. */
export function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]!.toUpperCase()).join("");
}

/** The first name, for "Write to Dana". */
export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

const STEP_NAMES = ["Sent", "Follow-up", "Last follow-up"] as const;

export interface EmailRow {
  id: string;
  label: string;
  /** Sent: its time today, or its date; planned: "Tue, Oct 20". */
  when: string;
  sent: boolean;
  /** Under a sent first email: the role it was about. */
  detail?: string;
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** O5: each email, sent or planned; skipped ones (after a reply) go. */
export function emailRows(thread: OutreachThread, now = new Date()): EmailRow[] {
  return thread.messages.filter((message) => message.status === "sent" || message.status === "scheduled").map((message) => {
    const sent = message.status === "sent";
    const at = new Date((sent ? message.sent_at : message.due_at) ?? thread.updated_at);
    const when = sent && sameDay(at, now)
      ? at.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
      : sent ? shortDate(at.toISOString(), now)
      : at.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
    return {
      id: message.id,
      label: sent ? (message.step === 0 ? "Sent" : STEP_NAMES[message.step]) : STEP_NAMES[message.step],
      when,
      sent,
      detail: sent && message.step === 0 ? thread.job_title ?? undefined : undefined,
    };
  });
}

/** The first email, until it's sent. */
export function unsentFirst(thread: OutreachThread): OutreachMessage | undefined {
  return thread.messages.find((message) => message.step === 0 && message.status === "draft");
}

/** The next follow-up waiting to go. */
export function nextFollowUp(thread: OutreachThread): OutreachMessage | undefined {
  if (thread.status !== "active") return undefined;
  return thread.messages.filter((message) => message.status === "scheduled" && message.due_at)
    .sort((a, b) => Date.parse(a.due_at!) - Date.parse(b.due_at!))[0];
}

/** O7: what an application's row says once you've written to someone there. */
export function trackerOutreachLine(thread: OutreachThread, now = new Date()): string | null {
  if (thread.status === "draft") return null;
  if (thread.status === "replied") return `${thread.contact.name} replied`;
  const next = nextFollowUp(thread);
  return next?.due_at ? `Emailed ${thread.contact.name} · follow-up ${shortDate(next.due_at, now)}` : `Emailed ${thread.contact.name}`;
}

/** When the first email went. */
export function firstSentAt(thread: OutreachThread): string | null {
  return thread.messages.find((message) => message.step === 0 && message.sent_at)?.sent_at ?? null;
}
