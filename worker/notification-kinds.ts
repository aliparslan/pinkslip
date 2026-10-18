// Every kind of notification Pinkslip sends or will send
// (docs/backend-inventory-2026-10-16.md §1 and Decisions: Notifications).
// Settings exist for every kind from the start; `live` marks the ones that
// send today, and only those are offered to the apps.

export type NotificationKind =
  | "new_jobs"
  | "saved_job_closed"
  | "follow_up"
  | "application_moved"
  | "which_application"
  | "interview_reminder"
  | "assessment_due"
  | "offer_reply"
  | "no_word"
  | "replied"
  | "daily_summary";

interface KindSpec {
  /** The inventory's number. */
  n: string;
  /** Sends today. */
  live: boolean;
  /** On until the person turns it off. */
  defaultOn: boolean;
  /** Breaks through Focus and skips the daily cap (Decisions: Notifications #3). */
  timeSensitive: boolean;
}

export const NOTIFICATION_KINDS: Record<NotificationKind, KindSpec> = {
  // N1 as they post, N2 once a day. Off until the person turns alerts on, as before.
  new_jobs: { n: "N1, N2", live: true, defaultOn: false, timeSensitive: false },
  saved_job_closed: { n: "N9", live: true, defaultOn: true, timeSensitive: false },
  follow_up: { n: "N10", live: true, defaultOn: true, timeSensitive: false },
  // An interview or offer move is sent time-sensitive on its own.
  application_moved: { n: "N3", live: true, defaultOn: true, timeSensitive: false },
  which_application: { n: "N4", live: true, defaultOn: true, timeSensitive: false },
  // From the application's date (worker/reminders.ts). Interview and offer
  // reminders sit outside the cap (UNCAPPED_KINDS); only the one closest to
  // the moment breaks through Focus.
  interview_reminder: { n: "N5", live: true, defaultOn: true, timeSensitive: false },
  assessment_due: { n: "N6", live: true, defaultOn: true, timeSensitive: false },
  offer_reply: { n: "N7", live: true, defaultOn: true, timeSensitive: false },
  no_word: { n: "N8", live: true, defaultOn: true, timeSensitive: false },
  // Step 5.
  replied: { n: "N11", live: false, defaultOn: true, timeSensitive: true },
  // Exists but off by default (Decisions: Notifications #1).
  daily_summary: { n: "N16", live: false, defaultOn: false, timeSensitive: false },
};

export function isNotificationKind(value: unknown): value is NotificationKind {
  return typeof value === "string" && Object.hasOwn(NOTIFICATION_KINDS, value);
}

export const LIVE_KINDS = (Object.keys(NOTIFICATION_KINDS) as NotificationKind[])
  .filter((kind) => NOTIFICATION_KINDS[kind].live);

/** Passive pushes a person gets in any 24 hours (Decisions: Notifications #3). */
export const PASSIVE_PER_DAY = 3;
export const PASSIVE_WINDOW_MS = 24 * 60 * 60 * 1000;
/**
 * Least time between two passive pushes, so the three fall across the day
 * instead of in the first hour of new jobs (owner, 2026-10-17).
 */
export const PASSIVE_SPACING_MS = 4 * 60 * 60 * 1000;

/**
 * New-job alerts are the person's own choice of how often (as they post, or
 * once a day), so they neither wait for the cap nor count toward it; the cap
 * keeps everything else from piling on (owner, 2026-10-17).
 */
export const UNCAPPED_KINDS: readonly NotificationKind[] = ["new_jobs", "interview_reminder", "offer_reply"];

/**
 * Passive kinds with a moment attached go out when they come due, without
 * the 4-hour spacing, and still count toward the three (owner, 2026-10-18).
 */
export const UNSPACED_KINDS: readonly NotificationKind[] = ["follow_up", "assessment_due"];

/** New jobs once a day, until the person picks a time. */
export const DEFAULT_DAILY_TIME = "08:00";

/**
 * Where each push opens. The iPhone app maps these paths to its own screens
 * (apps/native/src/platform/links.ts); the web opens them as they are.
 */
export const notificationLinks = {
  job: (jobId: string) => `/jobs/${encodeURIComponent(jobId)}`,
  feed: () => "/",
  saved: () => "/library/saved",
  applied: () => "/library/applied",
  today: () => "/today",
  alerts: () => "/you/alerts",
  followUp: (jobId: string | null, threadId: string) =>
    jobId ? `/jobs/${encodeURIComponent(jobId)}?outreach=${encodeURIComponent(threadId)}` : "/library/applied",
  /** The application's page (its stub and timeline). */
  application: (applicationId: string) => `/applications/${encodeURIComponent(applicationId)}`,
};

export interface LoggedNotification {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  url: string;
  entity_id: string | null;
}

/** "Stripe, Ramp and Datadog" or "Stripe, Ramp, Datadog and 2 more". */
export function listNames(names: string[], max = 3): string {
  const unique = [...new Set(names)];
  if (unique.length <= 1) return unique[0] ?? "";
  if (unique.length <= max) return `${unique.slice(0, -1).join(", ")} and ${unique.at(-1)}`;
  return `${unique.slice(0, max).join(", ")} and ${unique.length - max} more`;
}

/**
 * Notifications of one kind that come due together go out as one push when
 * the kind knows how to group them; the rest go one by one.
 */
const GROUPS: Partial<Record<NotificationKind, (rows: LoggedNotification[]) => { title: string; body: string; url: string }>> = {
  // Each row's title is the company (see savedJobClosedNotification).
  saved_job_closed: (rows) => ({
    title: `${rows.length} saved jobs closed`,
    body: listNames(rows.map((row) => row.title)),
    url: notificationLinks.saved(),
  }),
};

export function groupedNotification(kind: NotificationKind, rows: LoggedNotification[]) {
  if (rows.length === 1) return { title: rows[0]!.title, body: rows[0]!.body, url: rows[0]!.url };
  return GROUPS[kind]?.(rows) ?? null;
}

export function groupable(kind: NotificationKind): boolean {
  return Boolean(GROUPS[kind]);
}

/** N9: the company says it, the role says which. */
export function savedJobClosedNotification(job: { jobId: string; company: string; title: string }) {
  return {
    title: job.company,
    body: `${job.title} has closed`,
    url: notificationLinks.job(job.jobId),
  };
}

/** N10: a follow-up the person sends from their own mail came due. */
export function followUpNotification(row: {
  thread_id: string;
  step: 1 | 2;
  job_id: string | null;
  company_name: string;
  contact_name: string;
}) {
  const who = row.contact_name.trim().split(/\s+/)[0] || "the recruiter";
  return {
    title: `Follow up with ${row.company_name}`,
    body: row.step === 1
      ? `Your follow-up to ${who} is ready to send.`
      : `Your last follow-up to ${who} is ready to send.`,
    url: notificationLinks.followUp(row.job_id, row.thread_id),
  };
}

/** What an email's step says as news (the app's What changed says the same). */
export const STAGE_NEWS = {
  applied: "Application received",
  assessment: "Assessment sent",
  interview: "Interview invite",
  offer: "Offer",
  rejected: "Not moving forward",
} as const;

/** N3: an email moved an application. Interview and offer break through Focus. */
export function applicationMovedNotification(application: { id: string; company_name: string; title: string }, stage: keyof typeof STAGE_NEWS) {
  return {
    title: application.company_name,
    body: `${STAGE_NEWS[stage]} · ${application.title}`,
    url: notificationLinks.application(application.id),
    timeSensitive: stage === "interview" || stage === "offer",
  };
}

/** N4: an email matched more than one application. Today asks which. */
export function whichApplicationNotification(email: { company_name: string | null; sender_name: string }) {
  return {
    title: email.company_name || email.sender_name || "A job email",
    body: "Which application is this?",
    url: notificationLinks.today(),
  };
}
