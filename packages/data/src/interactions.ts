import type { ApiClient } from "@pinkslip/core/api";
import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { removeJobFromLists, setJobViewed } from "./cache";
import { queryKeys } from "./keys";
import { useApi } from "./provider";

/** The account's viewed (read) job ids. Stored as an array so the cache stays
 * serializable; `useViewedJobs` exposes a Set. */
export const viewedJobsQueryOptions = (api: ApiClient) =>
  queryOptions({
    queryKey: queryKeys.personal.viewed(),
    queryFn: async () => (await api.interactions.viewedJobs()).job_ids,
    staleTime: 5 * 60_000,
  });

const toSet = (ids: string[]) => new Set(ids);

export function useViewedJobs(enabled = true) {
  return useQuery({ ...viewedJobsQueryOptions(useApi()), select: toSet, enabled });
}

/** Opening a job marks it read immediately; persistence is best effort, as in
 * the current app, so a failed write never interrupts navigation. */
export function useMarkViewed() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useCallback((id: string) => {
    setJobViewed(queryClient, id, true);
    void api.interactions.markViewed(id).catch(() => undefined);
  }, [api, queryClient]);
}

/** The row menu's "Mark as read/unread": optimistic, rolled back on failure. */
export function useSetViewed() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, viewed }: { id: string; viewed: boolean }) =>
      viewed ? api.interactions.markViewed(id) : api.interactions.markUnviewed(id),
    onMutate: ({ id, viewed }) => setJobViewed(queryClient, id, viewed),
    onError: (_error, _input, rollback) => rollback?.(),
  });
}

export interface HiddenJob {
  /** Un-hides the job and puts it back where it was in every list. */
  undo: () => Promise<void>;
}

/** Hide a job from the feed. The row leaves every list at once; a failure puts
 * it back and rethrows. The result's `undo` backs the toast's Undo action. */
export function useHideJob() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useCallback(async (id: string): Promise<HiddenJob> => {
    await queryClient.cancelQueries({ queryKey: queryKeys.personal.jobsRoot });
    const restore = removeJobFromLists(queryClient, id);
    try {
      await api.jobs.dismiss(id);
    } catch (error) {
      restore();
      throw error;
    }
    return {
      undo: async () => {
        await api.jobs.undismiss(id);
        restore();
        void queryClient.invalidateQueries({ queryKey: queryKeys.personal.jobsRoot });
      },
    };
  }, [api, queryClient]);
}

/** Admin: remove a job for everyone. Optimistic, rolled back on failure. */
export function useBlockJob() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.jobs.block(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.personal.jobsRoot });
      return removeJobFromLists(queryClient, id);
    },
    onError: (_error, _id, rollback) => rollback?.(),
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.personal.jobsRoot }),
  });
}
