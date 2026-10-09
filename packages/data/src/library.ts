import type { ApiClient, Job } from "@pinkslip/core/api";
import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { setJobApplied, setJobSaved } from "./cache";
import { queryKeys } from "./keys";
import { useApi } from "./provider";

export const savedJobsQueryOptions = (api: ApiClient) =>
  queryOptions({
    queryKey: queryKeys.personal.saved(),
    queryFn: async () => (await api.savedJobs.list()).jobs,
  });

export function useSavedJobs() {
  return useQuery(savedJobsQueryOptions(useApi()));
}

export const appliedJobsQueryOptions = (api: ApiClient) =>
  queryOptions({
    queryKey: queryKeys.personal.applied(),
    queryFn: async () => (await api.appliedJobs.list()).jobs,
  });

export function useAppliedJobs() {
  return useQuery(appliedJobsQueryOptions(useApi()));
}

export function useSaveJob() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.savedJobs.save(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.personal.job(id) });
      return setJobSaved(queryClient, id, true);
    },
    onError: (_error, _id, rollback) => rollback?.(),
    onSuccess: (job) => setJobSaved(queryClient, job.id, true, job),
    onSettled: (_job, _error, id) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.personal.saved() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.personal.job(id) });
    },
  });
}

export function useUnsaveJob() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.savedJobs.unsave(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.personal.job(id) });
      return setJobSaved(queryClient, id, false);
    },
    onError: (_error, _id, rollback) => rollback?.(),
    onSuccess: (job) => setJobSaved(queryClient, job.id, false, job),
    onSettled: (_job, _error, id) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.personal.saved() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.personal.job(id) });
    },
  });
}

export function useMarkApplied() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (job: Job) => api.jobs.markApplied(job.id),
    onMutate: async (job) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.personal.job(job.id) });
      return setJobApplied(queryClient, job, true);
    },
    onError: (_error, _job, rollback) => rollback?.(),
    onSuccess: (job) => setJobApplied(queryClient, job, true),
    onSettled: (_job, _error, job) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.personal.applied() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.personal.jobsRoot });
      void queryClient.invalidateQueries({ queryKey: queryKeys.personal.job(job.id) });
    },
  });
}

export function useUnmarkApplied() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (job: Job) => api.jobs.unmarkApplied(job.id),
    onMutate: async (job) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.personal.job(job.id) });
      return setJobApplied(queryClient, job, false);
    },
    onError: (_error, _job, rollback) => rollback?.(),
    onSuccess: (job) => setJobApplied(queryClient, job, false),
    onSettled: (_job, _error, job) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.personal.applied() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.personal.jobsRoot });
      void queryClient.invalidateQueries({ queryKey: queryKeys.personal.job(job.id) });
    },
  });
}
