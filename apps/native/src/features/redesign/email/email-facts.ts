import type { InboundEmail, Inbox } from "@pinkslip/core/api";
import { plainText } from "../job-facts";
import { stageGroupLabels, trackerAge } from "../tracker-facts";

/** Off until set up; waiting once the address is added (or Gmail's code came
 * in) until the first email arrives; on after that. */
export type TrackingState = "off" | "waiting" | "on";

export function trackingState(inbox: Inbox | undefined, started: boolean): TrackingState {
  if (inbox?.forwarding.confirmed_at) return "on";
  if (started || inbox?.forwarding.code || inbox?.forwarding.link) return "waiting";
  return "off";
}

export const trackingStateLabels: Record<TrackingState, string> = { off: "Off", waiting: "Waiting", on: "On" };

/** What an email did, as the Job emails row's headline. */
export function emailHeadline(email: InboundEmail): string {
  switch (email.status) {
    case "needs_choice":
      return "Which application?";
    case "created":
      return "Added to Tracker";
    case "unchanged":
      return "No change";
    case "dismissed":
      return "Not about an application";
    case "undone":
      return "Undone";
    case "applied":
    case "assigned":
      return email.detected_stage === "rejected" ? "Rejected" : `Moved to ${stageGroupLabels[email.detected_stage]}`;
  }
}

/** The row's first line: the company, or who sent it when no company matched. */
export const emailCompany = (email: InboundEmail) => plainText(email.company_name ?? email.sender_name ?? email.sender_address);

/** The subject in quotes, as the row's third line. */
export const emailSubject = (email: InboundEmail) => `“${plainText(email.subject)}”`;

export const emailAge = (email: InboundEmail, now = new Date()) => trackerAge(email.received_at, now);

/** "14 job emails this month": the emails Pinkslip recognized since the 1st. */
export function jobEmailsThisMonth(emails: readonly InboundEmail[], now = new Date()): number {
  const start = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  return emails.filter((email) => new Date(email.received_at).getTime() >= start).length;
}

/** "2h since the last email": any email reaching the address counts. */
export function sinceLastEmail(lastEmailAt: string | null, now = new Date()): string | null {
  if (!lastEmailAt) return null;
  const minutes = Math.max(0, Math.floor((now.getTime() - new Date(lastEmailAt).getTime()) / 60_000));
  if (minutes < 60) return `${Math.max(1, minutes)}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

/** The address with its middle cut, for a row's value: "inbox+k7m2xq@…". */
export function shortAddress(address: string): string {
  const at = address.indexOf("@");
  return at > 0 ? `${address.slice(0, at + 1)}…` : address;
}
