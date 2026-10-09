import { ApiError, type ApiClient, type JobsListParams } from "@pinkslip/core/api";
import { queryOptions, useQuery } from "@tanstack/react-query";
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

/** Personalized feed reads. Added for the Phase 4 feed; unused until then. */
export const jobsListQueryOptions = (api: ApiClient, params?: JobsListParams) =>
  queryOptions({
    queryKey: queryKeys.personal.jobs(params),
    queryFn: () => api.jobs.list(params),
  });

export function useJobsList(params?: JobsListParams) {
  return useQuery(jobsListQueryOptions(useApi(), params));
}

export const jobQueryOptions = (api: ApiClient, id: string) =>
  queryOptions({
    queryKey: queryKeys.personal.job(id),
    queryFn: () => api.jobs.get(id),
  });

export function useJob(id: string) {
  return useQuery(jobQueryOptions(useApi(), id));
}
