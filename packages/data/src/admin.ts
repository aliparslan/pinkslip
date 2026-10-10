import type {
  ApiClient, ClassificationDisagreement, ClassificationDisagreements, ClassificationVerdict, ContentReport,
  FeedbackSubmission, JobReview,
} from "@pinkslip/core/api";
import { infiniteQueryOptions, queryOptions, useInfiniteQuery, useMutation, useQuery, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { queryKeys } from "./keys";
import { useApi } from "./provider";

/* Admin workspace queries. They live under the personal root, so signing out
 * or switching accounts drops them with everything else. */

export function useProductMetrics() {
  const api = useApi();
  return useQuery(queryOptions({ queryKey: queryKeys.personal.admin("metrics"), queryFn: () => api.metrics.get() }));
}

export const feedbackInboxQueryOptions = (api: ApiClient) =>
  queryOptions({ queryKey: queryKeys.personal.admin("feedback"), queryFn: async () => (await api.interactions.feedback("active")).feedback });

export const reportsQueryOptions = (api: ApiClient) =>
  queryOptions({ queryKey: queryKeys.personal.admin("reports"), queryFn: async () => (await api.interactions.reports("open")).reports });

export const JOB_REVIEW_PAGE_SIZE = 20;

type ReviewPage = Awaited<ReturnType<ApiClient["interactions"]["jobReviews"]>>;

export const jobReviewsQueryOptions = (api: ApiClient) =>
  infiniteQueryOptions({
    queryKey: queryKeys.personal.admin("reviews"),
    queryFn: ({ pageParam }) => api.interactions.jobReviews("needs_review", JOB_REVIEW_PAGE_SIZE, pageParam),
    initialPageParam: 0,
    getNextPageParam: (last: ReviewPage) => (last.meta.has_more ? last.meta.next_offset : undefined),
  });

export function useFeedbackInbox() {
  return useQuery(feedbackInboxQueryOptions(useApi()));
}

export function useReports() {
  return useQuery(reportsQueryOptions(useApi()));
}

export function useJobReviews() {
  return useInfiniteQuery(jobReviewsQueryOptions(useApi()));
}

/** Swaps a cached list for the optimistic one; returns the rollback. */
function optimistic<T>(queryClient: ReturnType<typeof useQueryClient>, key: readonly unknown[], update: (value: T) => T) {
  const previous = queryClient.getQueryData<T>(key);
  if (previous !== undefined) queryClient.setQueryData<T>(key, update(previous));
  return () => queryClient.setQueryData(key, previous);
}

/** Plan keeps the item in the inbox; resolve and decline take it out. */
export function useModerateFeedback() {
  const api = useApi();
  const queryClient = useQueryClient();
  const key = queryKeys.personal.admin("feedback");
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: FeedbackSubmission["status"] }) => api.interactions.updateFeedback(id, { status }),
    onMutate: async ({ id, status }) => {
      await queryClient.cancelQueries({ queryKey: key });
      return optimistic<FeedbackSubmission[]>(queryClient, key, (items) => status === "planned" || status === "new"
        ? items.map((item) => (item.id === id ? { ...item, status } : item))
        : items.filter((item) => item.id !== id));
    },
    onError: (_error, _input, rollback) => rollback?.(),
  });
}

export function useModerateReport() {
  const api = useApi();
  const queryClient = useQueryClient();
  const key = queryKeys.personal.admin("reports");
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: ContentReport["status"] }) => api.interactions.updateReport(id, { status }),
    onMutate: async ({ id, status }) => {
      await queryClient.cancelQueries({ queryKey: key });
      return status === "open" ? undefined : optimistic<ContentReport[]>(queryClient, key, (items) => items.filter((item) => item.id !== id));
    },
    onError: (_error, _input, rollback) => rollback?.(),
  });
}

export function useModerateReview() {
  const api = useApi();
  const queryClient = useQueryClient();
  const key = queryKeys.personal.admin("reviews");
  return useMutation({
    mutationFn: ({ jobId, state, note }: { jobId: string; state: JobReview["state"]; note?: string }) =>
      api.interactions.updateJobReview(jobId, { state, admin_note: note }),
    onMutate: async ({ jobId, state }) => {
      await queryClient.cancelQueries({ queryKey: key });
      if (state === "needs_review") return undefined;
      return optimistic<InfiniteData<ReviewPage, number>>(queryClient, key, (data) => {
        const removed = data.pages.some((page) => page.reviews.some((review) => review.job_id === jobId)) ? 1 : 0;
        return {
          ...data,
          pages: data.pages.map((page) => ({
            reviews: page.reviews.filter((review) => review.job_id !== jobId),
            meta: { ...page.meta, total: Math.max(0, page.meta.total - removed), next_offset: Math.max(0, page.meta.next_offset - removed) },
          })),
        };
      });
    },
    onError: (_error, _input, rollback) => rollback?.(),
  });
}

/** Refetches the inbox lists (after an Undo puts something back). */
export function useRefreshInbox() {
  const queryClient = useQueryClient();
  return (part: "feedback" | "reports" | "reviews") => queryClient.invalidateQueries({ queryKey: queryKeys.personal.admin(part) });
}

export function useRuns() {
  const api = useApi();
  return useQuery(queryOptions({ queryKey: queryKeys.personal.admin("runs"), queryFn: async () => (await api.runs.list(50)).runs ?? [] }));
}

/** Supplementary: a failure here never hides the run list. */
export function useRunLatency() {
  const api = useApi();
  return useQuery(queryOptions({ queryKey: queryKeys.personal.admin("latency"), queryFn: async () => (await api.runs.latency()).tiers, retry: false }));
}

export const MANUAL_SWEEP_BATCHES = 5;

/** "Run now": polls every source in a few batches, reporting progress. */
export function useRefreshAllSources(onBatch?: (batch: number) => void) {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      let polled = 0;
      let found = 0;
      let log: string[] = [];
      for (let batch = 1; batch <= MANUAL_SWEEP_BATCHES; batch += 1) {
        onBatch?.(batch);
        const result = await api.ops.refreshAll();
        polled += result.companiesPolled;
        found += result.newJobsFound;
        log = result.log ?? [];
      }
      return { polled, found, log };
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.personal.admin("runs") }),
  });
}

export function useClassificationReport() {
  const api = useApi();
  return useQuery(queryOptions({ queryKey: queryKeys.personal.admin("jev"), queryFn: () => api.classification.disagreements() }));
}

/** Records or clears the verdict on one disagreement. */
export function useClassificationVerdict() {
  const api = useApi();
  const queryClient = useQueryClient();
  const key = queryKeys.personal.admin("jev");
  return useMutation({
    mutationFn: async ({ cacheKey, verdict }: { cacheKey: string; verdict: ClassificationVerdict | null }) =>
      verdict ? api.classification.review(cacheKey, verdict) : (await api.classification.clearReview(cacheKey), null),
    onSuccess: (review: ClassificationDisagreement["review"], { cacheKey }) =>
      queryClient.setQueryData<ClassificationDisagreements>(key, (report) => report && {
        ...report,
        disagreements: report.disagreements?.map((row) => (row.cache_key === cacheKey ? { ...row, review } : row)),
      }),
  });
}
