import { timeAgo } from "./utils";

export interface JobTimingInput {
  posted_at: string | null;
  first_seen_at: string | null;
  evergreen: boolean | number;
  source_type?: string | null;
}

/**
 * A row is visually new based on the source's posting timestamp whenever one
 * exists. Discovery time is only the fallback for sources, such as Bloomberg,
 * that do not publish a date at all.
 */
export function isFreshJobTiming(
  job: Pick<JobTimingInput, "posted_at" | "first_seen_at">,
  nowMs = Date.now(),
  windowMs = 48 * 60 * 60 * 1000,
): boolean {
  const timestamp = job.posted_at ?? job.first_seen_at;
  if (!timestamp) return false;
  const timestampMs = new Date(timestamp).getTime();
  if (!Number.isFinite(timestampMs)) return false;
  const ageMs = nowMs - timestampMs;
  return ageMs >= 0 && ageMs < windowMs;
}

function sourceTiming(job: JobTimingInput): string {
  if (job.posted_at) {
    const verb = job.source_type === "greenhouse" ? "Updated" : "Posted";
    return `${verb} ${timeAgo(job.posted_at)}`;
  }
  if (job.first_seen_at) return `Discovered ${timeAgo(job.first_seen_at)}`;
  return "Post date unknown";
}

export function jobTimingLabel(job: JobTimingInput): string {
  const timing = sourceTiming(job);
  if (!job.evergreen) return timing;
  if (timing.startsWith("Posted ")) {
    return `Evergreen · First ${timing.toLowerCase()}`;
  }
  return `Evergreen · ${timing}`;
}

/** Greenhouse exposes its latest update as `posted_at`, not the original post
 * date. The detail screen can pair that update with the factual date we do have. */
export function jobOriginalTimingLabel(job: JobTimingInput): string | null {
  if (job.source_type !== "greenhouse" || !job.posted_at || !job.first_seen_at) return null;
  return `Discovered ${timeAgo(job.first_seen_at)}`;
}
