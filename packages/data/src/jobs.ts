import { ApiError, type ApiClient, type JobsListParams } from "@pinkslip/core/api";
import { infiniteQueryOptions, queryOptions, useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { queryKeys } from "./keys";
import { useApi } from "./provider";

/** Anonymous, credential-free catalog reads shared by web SSR and native. */
export const publicJobsQueryOptions = (api: ApiClient) =>
  queryOptions({
    queryKey: queryKeys.public.jobs(),
    queryFn: () => api.public.jobs(),
    staleTime: 60_000,
  });

export const publicJobQueryOptions = (api: ApiClient, id: string) =>
  queryOptions({
    queryKey: queryKeys.public.job(id),
    queryFn: async () => {
      try {
        return await api.public.job(id);
      } catch (error) {
        // A missing job is a valid "not found" state; loaders turn it into 404.
        if (error instanceof ApiError && error.status === 404) return null;
        throw error;
      }
    },
    staleTime: 60_000,
  });

export function usePublicJobs() {
  return useQuery(publicJobsQueryOptions(useApi()));
}

export function usePublicJob(id: string) {
  return useQuery(publicJobQueryOptions(useApi(), id));
}

export const FEED_PAGE_SIZE = 25;

/** The personalized feed for one set of criteria, a page at a time. Every
 * page lives under one key, so returning to the feed restores everything
 * already loaded, and hide/save/apply update all pages at once. */
export const feedQueryOptions = (api: ApiClient, params: JobsListParams) =>
  infiniteQueryOptions({
    queryKey: queryKeys.personal.jobs(params),
    queryFn: ({ pageParam }) =>
      api.jobs.list({ ...params, limit: String(FEED_PAGE_SIZE), offset: String(pageParam) }),
    initialPageParam: 0,
    getNextPageParam: (last) => (last.meta.has_more ? (last.meta.next_offset ?? undefined) : undefined),
    // Coming back from a job keeps the exact list; focus refreshes it later.
    staleTime: 5 * 60_000,
  });

export function useFeed(params: JobsListParams, enabled = true) {
  return useInfiniteQuery({ ...feedQueryOptions(useApi(), params), enabled });
}

/** Catalog health: when the poller last finished. */
export const statsQueryOptions = (api: ApiClient) =>
  queryOptions({
    queryKey: queryKeys.personal.stats(),
    queryFn: () => api.stats.get(),
    staleTime: 5 * 60_000,
  });

export function useStats(enabled = true) {
  return useQuery({ ...statsQueryOptions(useApi()), enabled });
}

/** The saved search profile; readable before a session exists. */
export const preferencesQueryOptions = (api: ApiClient) =>
  queryOptions({
    queryKey: queryKeys.personal.preferences(),
    queryFn: () => api.preferences.get(),
    staleTime: 5 * 60_000,
  });

export function usePreferences(enabled = true) {
  return useQuery({ ...preferencesQueryOptions(useApi()), enabled });
}

export const jobQueryOptions = (api: ApiClient, id: string) =>
  queryOptions({
    queryKey: queryKeys.personal.job(id),
    queryFn: () => api.jobs.get(id),
  });

/** The signed-in view of one job: saved/applied state, match reason, and the
 * description once a pending backfill lands (`content_pending`). */
export function useJob(id: string, enabled = true) {
  return useQuery({
    ...jobQueryOptions(useApi(), id),
    enabled,
    refetchInterval: (query) => {
      const job = query.state.data;
      // The current app retried five times at the server's suggested pace.
      if (!job?.content_pending || job.description || query.state.dataUpdateCount > 5) return false;
      return job.content_refresh_after_ms ?? 1500;
    },
  });
}
