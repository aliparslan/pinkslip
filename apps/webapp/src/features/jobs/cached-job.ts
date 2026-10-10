import type { InfiniteData, QueryClient } from "@tanstack/react-query";
import type { Job, PublicJob } from "@pinkslip/core/api";
import type { PublicJobSummary } from "@pinkslip/domain/public-jobs";
import { queryKeys } from "@pinkslip/data";

export type AnyJob = Job | PublicJob | PublicJobSummary;

/** The freshest copy of a job already in the cache: its own query, then any
 * list it appears in. A job opened from a list renders at once from this
 * while its full record loads. */
export function cachedJob(queryClient: QueryClient, id: string): AnyJob | undefined {
  const own = queryClient.getQueryData<Job>(queryKeys.personal.job(id)) ?? queryClient.getQueryData<PublicJob | null>(queryKeys.public.job(id));
  if (own) return own;
  type Lists = Job[] | { jobs: Job[] } | InfiniteData<{ jobs: Job[] }> | undefined;
  for (const key of [queryKeys.personal.jobsRoot, queryKeys.personal.saved(), queryKeys.personal.applied()]) {
    for (const [, data] of queryClient.getQueriesData<Lists>({ queryKey: key })) {
      const jobs = Array.isArray(data) ? data : data && "pages" in data ? data.pages.flatMap((page) => page.jobs) : data?.jobs ?? [];
      const found = jobs.find((job) => job.id === id);
      if (found) return found;
    }
  }
  return queryClient.getQueryData<{ jobs: PublicJobSummary[] }>(queryKeys.public.jobs())?.jobs.find((job) => job.id === id);
}
