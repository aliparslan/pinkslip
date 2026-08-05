import { timeAgo } from "./utils";

export interface JobTimingInput {
  posted_at: string | null;
  first_seen_at: string | null;
  evergreen: boolean | number;
  source_type?: string | null;
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
