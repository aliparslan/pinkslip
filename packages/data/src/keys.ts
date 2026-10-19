import type { ApplicationStage, InboundEmailStatus, JobsListParams } from "@pinkslip/core/api";

/**
 * Public catalog keys never carry owner state. All personal keys live under one
 * `personal` root so an owner change can cancel and remove them in one pass.
 */
export const queryKeys = {
  public: {
    jobs: () => ["public", "jobs"] as const,
    job: (id: string) => ["public", "job", id] as const,
  },
  personal: {
    root: ["personal"] as const,
    jobsRoot: ["personal", "jobs"] as const,
    jobs: (params?: JobsListParams) => ["personal", "jobs", params ?? null] as const,
    job: (id: string) => ["personal", "job", id] as const,
    saved: () => ["personal", "library", "saved"] as const,
    applied: () => ["personal", "library", "applied"] as const,
    applicationsRoot: ["personal", "applications"] as const,
    applications: (stage?: ApplicationStage) => ["personal", "applications", "list", stage ?? null] as const,
    application: (id: string) => ["personal", "applications", "detail", id] as const,
    inbox: () => ["personal", "inbox"] as const,
    inboxEmails: (status?: InboundEmailStatus) => ["personal", "inbox", "emails", status ?? null] as const,
    viewed: () => ["personal", "viewed"] as const,
    stats: () => ["personal", "stats"] as const,
    preferences: () => ["personal", "preferences"] as const,
    push: () => ["personal", "push"] as const,
    notifications: () => ["personal", "notifications"] as const,
    today: () => ["personal", "today"] as const,
    resume: () => ["personal", "resume"] as const,
    answers: () => ["personal", "answers"] as const,
    companies: () => ["personal", "companies"] as const,
    /** A company's events and one event: personal, since each carries the viewer's Remind me. */
    eventsRoot: ["personal", "events"] as const,
    companyEvents: (companyId: string) => ["personal", "events", "company", companyId] as const,
    event: (id: string) => ["personal", "events", "detail", id] as const,
    prepared: (jobId: string) => ["personal", "prepared", jobId] as const,
    outreach: (jobId: string, threadId: string | null) => ["personal", "outreach", jobId, threadId] as const,
    /** Every recruiter thread, and one by id: the redesign's person pages and Today. */
    outreachAll: () => ["personal", "outreach", "all"] as const,
    outreachById: (threadId: string) => ["personal", "outreach", "thread", threadId] as const,
    /** A company's People (the root covers every company, as one company can have two ids). */
    outreachPeopleRoot: ["personal", "outreach", "people"] as const,
    outreachPeople: (companyId: string) => ["personal", "outreach", "people", companyId] as const,
    admin: (part: "metrics" | "feedback" | "reports" | "reviews" | "runs" | "latency" | "jev" | "recruiters") => ["personal", "admin", part] as const,
  },
  session: () => ["session"] as const,
} as const;
