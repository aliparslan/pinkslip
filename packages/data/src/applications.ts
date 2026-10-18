import type { ApiClient, ApplicationDetail, ApplicationStage } from "@pinkslip/core/api";
import { queryOptions, useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { queryKeys } from "./keys";
import { useApi } from "./provider";

/* Applications with stages, for Tracker. Today's screens still read the saved
   and applied job lists in ./library; every change here refreshes those too. */

export const applicationsQueryOptions = (api: ApiClient, stage?: ApplicationStage) =>
  queryOptions({
    queryKey: queryKeys.personal.applications(stage),
    queryFn: async () => (await api.applications.list(stage)).applications,
  });

export function useApplications(stage?: ApplicationStage) {
  return useQuery(applicationsQueryOptions(useApi(), stage));
}

export const applicationQueryOptions = (api: ApiClient, id: string) =>
  queryOptions({
    queryKey: queryKeys.personal.application(id),
    queryFn: () => api.applications.get(id),
  });

export function useApplication(id: string) {
  return useQuery(applicationQueryOptions(useApi(), id));
}

function refreshAfterChange(queryClient: QueryClient, jobId: string | null) {
  void queryClient.invalidateQueries({ queryKey: queryKeys.personal.applicationsRoot });
  void queryClient.invalidateQueries({ queryKey: queryKeys.personal.today() });
  void queryClient.invalidateQueries({ queryKey: queryKeys.personal.saved() });
  void queryClient.invalidateQueries({ queryKey: queryKeys.personal.applied() });
  void queryClient.invalidateQueries({ queryKey: queryKeys.personal.stats() });
  if (jobId) void queryClient.invalidateQueries({ queryKey: queryKeys.personal.job(jobId) });
}

function storeDetail(queryClient: QueryClient, detail: ApplicationDetail) {
  queryClient.setQueryData(queryKeys.personal.application(detail.id), detail);
}

/** Tracks a job at a stage, creating its application if needed. */
export function useTrackJob() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ jobId, stage }: { jobId: string; stage: ApplicationStage }) => api.applications.track(jobId, stage),
    onSuccess: (detail) => storeDetail(queryClient, detail),
    onSettled: (_detail, _error, { jobId }) => refreshAfterChange(queryClient, jobId),
  });
}

export function useUpdateApplication() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...changes }: { id: string; stage?: ApplicationStage; stage_date?: string | null; notes?: string }) =>
      api.applications.update(id, changes),
    onSuccess: (detail) => storeDetail(queryClient, detail),
    onSettled: (detail) => refreshAfterChange(queryClient, detail?.job_id ?? null),
  });
}

export function useRemoveApplication() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string; jobId: string | null }) => api.applications.remove(id),
    onSuccess: (_result, { id }) => queryClient.removeQueries({ queryKey: queryKeys.personal.application(id) }),
    onSettled: (_result, _error, { jobId }) => refreshAfterChange(queryClient, jobId),
  });
}

/** Today in one request: Needs you, What changed and Coming up, with the
 * app icon's badge (GET /today). */
export function useToday(enabled = true) {
  const api = useApi();
  return useQuery({ queryKey: queryKeys.personal.today(), queryFn: () => api.today.get(), enabled });
}

/** Opening Today marks it seen on every device. */
export function useMarkTodaySeen() {
  const api = useApi();
  return useMutation({ mutationFn: () => api.today.seen() });
}
