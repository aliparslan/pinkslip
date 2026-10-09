import type { JobsListParams } from "@pinkslip/core/api";

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
  },
  session: () => ["session"] as const,
} as const;
