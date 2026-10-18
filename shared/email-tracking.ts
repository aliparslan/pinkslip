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
  /** The company's site, for its logo. */
  company_domain?: string | null;
  application_id: string | null;
  /** Filled while status is needs_choice. */
  candidates: { id: string; title: string; stage: ApplicationStage }[];
}

/** Where the user's job mail lands. Setup shows that provider's steps. */
export const FORWARDING_PROVIDERS = ["gmail", "outlook", "icloud", "school"] as const;
export type ForwardingProvider = (typeof FORWARDING_PROVIDERS)[number];

/** Gmail can forward everything, or only what a filter we write catches. */
export type ForwardingScope = "everything" | "job";

export const forwardingProviderNames: Record<ForwardingProvider, string> = {
  gmail: "Gmail",
  outlook: "Outlook or Hotmail",
  icloud: "iCloud",
  school: "School or work email",
};

/** The senders the "Only job mail" filter keeps: the hiring services that
 * send most application mail. A short subset of HIRING_SERVICE_DOMAINS in
 * worker/email/rules.ts, so the filter fits Gmail's search bar; the subject
 * words catch mail from the companies themselves. */
const JOB_MAIL_FILTER_DOMAINS = [
  "greenhouse.io", "greenhouse-mail.io", "lever.co", "ashbyhq.com", "myworkday.com", "smartrecruiters.com",
  "icims.com", "jobvite.com", "workable.com", "hackerrank.com", "codesignal.com",
];

export const JOB_MAIL_FILTER = `from:(${JOB_MAIL_FILTER_DOMAINS.join(" OR ")}) OR subject:(application OR applying OR interview OR offer OR assessment)`;

/** The line above the address in setup: where to go on the computer. */
export const forwardingIntros: Record<ForwardingProvider, string> = {
  gmail: "Gmail only turns this on in a browser. Open Gmail, then Settings › Forwarding › Add a forwarding address, and paste:",
  outlook: "Open Outlook.com on your computer, then Settings › Mail › Forwarding. Turn it on and paste:",
  icloud: "Open iCloud.com on your computer, then Mail › Settings › Forwarding. Turn it on and paste:",
  school: "Open your school mail in a browser, then Settings › Mail › Forwarding. Turn it on and paste:",
};

/** Every step on the computer, for "Email me these steps". */
export function forwardingSteps(provider: ForwardingProvider, scope: ForwardingScope, address: string): string[] {
  switch (provider) {
    case "gmail":
      return [
        "Open Gmail in a browser, then Settings › See all settings › Forwarding and POP/IMAP.",
        `Choose Add a forwarding address and paste ${address}.`,
        "Gmail sends Pinkslip a code. It shows up in the app; type it into Gmail.",
        scope === "everything"
          ? `Choose "Forward a copy of incoming mail to ${address}", then Save.`
          : `Paste this into Gmail's search bar, then Create filter › Forward it to ${address}: ${JOB_MAIL_FILTER}`,
      ];
    case "outlook":
      return [
        "Open outlook.com in a browser, then Settings › Mail › Forwarding.",
        `Turn on forwarding and paste ${address}.`,
        "Check Keep a copy of forwarded messages, then Save.",
      ];
    case "icloud":
      return [
        "Open icloud.com/mail in a browser, then Settings › Forwarding.",
        `Turn on "Forward my email to" and paste ${address}.`,
        "Leave Delete messages after forwarding off, then Save.",
      ];
    case "school":
      return [
        "Open your school or work mail in a browser. Most are Outlook: Settings › Mail › Forwarding.",
        `Turn on forwarding, paste ${address} and keep a copy, then Save.`,
        "Some schools block forwarding. If nothing reaches Pinkslip in a day, the app says so.",
      ];
  }
}
