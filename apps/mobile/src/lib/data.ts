/* Server data for the screens, through React Query. Every list and the job
   page read from one cache, and an action on a job (save, apply, hide)
   updates each place that job appears at once, then confirms with the
   server. */

import { api, type Job, type JobsListMeta } from "@pinkslip/core/api";
import { isFreshJobTiming } from "@pinkslip/core/job-timing";
import { normalizeSearchProfile, profileLocationAliases } from "@pinkslip/domain/search-profile";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
} from "@tanstack/react-query";
import { Alert } from "react-native";
import { DEMO, demoApplied, demoJobs, demoViewed } from "./demo";
import type { FeedFilters } from "./filters";

const PAGE_SIZE = 25;

type FeedPage = { jobs: Job[]; meta: JobsListMeta };

export const keys = {
  feedRoot: ["feed"] as const,
  feed: (filters: FeedFilters) => ["feed", filters.query.trim(), filters.locations.join(","), filters.minPayK] as const,
  job: (id: string) => ["job", id] as const,
  saved: ["saved"] as const,
  applied: ["applied"] as const,
  viewed: ["viewed"] as const,
  bootstrap: ["bootstrap"] as const,
};

/* ------------------------------------------------------------- Queries */

function demoFeed(filters: FeedFilters): FeedPage {
  const query = filters.query.trim().toLowerCase();
  const jobs = demoJobs.filter(
    (job) => !query || job.title.toLowerCase().includes(query) || job.company_name.toLowerCase().includes(query),
  );
  return { jobs, meta: { total: jobs.length, has_more: false } };
}

export function useFeed(filters: FeedFilters) {
  return useInfiniteQuery({
    queryKey: keys.feed(filters),
    initialPageParam: 0,
    queryFn: async ({ pageParam }): Promise<FeedPage> => {
      if (DEMO) return demoFeed(filters);
      return api.jobs.list({
        limit: String(PAGE_SIZE),
        offset: String(pageParam),
        q: filters.query.trim() || undefined,
        locations: filters.locations.length ? filters.locations.join(",") : undefined,
        min_salary: filters.minPayK ? String(filters.minPayK * 1000) : undefined,
      });
    },
    getNextPageParam: (last, pages) => {
      const loaded = pages.reduce((count, page) => count + page.jobs.length, 0);
      if (!last.jobs.length || last.meta.has_more === false) return undefined;
      if (last.meta.has_more) return last.meta.next_offset ?? loaded;
      return loaded < last.meta.total ? loaded : undefined;
    },
  });
}

/** A job you have already loaded somewhere, so its page opens instantly. */
function findCachedJob(client: QueryClient, id: string): Job | undefined {
  for (const [, data] of client.getQueriesData<InfiniteData<FeedPage>>({ queryKey: keys.feedRoot })) {
    for (const page of data?.pages ?? []) {
      const job = page.jobs.find((candidate) => candidate.id === id);
      if (job) return job;
    }
  }
  for (const key of [keys.saved, keys.applied]) {
    const job = client.getQueryData<Job[]>(key)?.find((candidate) => candidate.id === id);
    if (job) return job;
  }
  return undefined;
}

export function useJob(id: string) {
  const client = useQueryClient();
  return useQuery({
    queryKey: keys.job(id),
    queryFn: async () => {
      if (DEMO) {
        const job = [...demoJobs, ...demoApplied].find((candidate) => candidate.id === id);
        if (!job) throw new Error("This job isn't here anymore.");
        return job;
      }
      return api.jobs.get(id);
    },
    placeholderData: () => findCachedJob(client, id),
    // Some postings are still being fetched when they first appear. Check back
    // a few times until the full description arrives.
    refetchInterval: (query) =>
      query.state.data?.content_pending && !query.state.data.description && query.state.dataUpdateCount < 8
        ? (query.state.data.content_refresh_after_ms ?? 4000)
        : false,
  });
}

export function useSavedJobs() {
  return useQuery({
    queryKey: keys.saved,
    queryFn: async () => (DEMO ? demoJobs.filter((job) => job.saved) : (await api.savedJobs.list()).jobs),
  });
}

export function useAppliedJobs() {
  return useQuery({
    queryKey: keys.applied,
    queryFn: async () => (DEMO ? demoApplied : (await api.appliedJobs.list()).jobs),
  });
}

export function useViewed() {
  return useQuery({
    queryKey: keys.viewed,
    queryFn: async () => new Set(DEMO ? demoViewed : (await api.interactions.viewedJobs()).job_ids),
    staleTime: 60_000,
  });
}

/** Whether a job counts as new: posted recently and not opened yet. */
export function isNewJob(job: Job, viewed: Set<string> | undefined): boolean {
  return !job.closed_at && !viewed?.has(job.id) && isFreshJobTiming(job);
}

/** The places in your search profile, as lowercase names to match a posting's
 * locations against ("new york", "bay area"). */
export function useYourPlaces(): string[] {
  const query = useQuery({
    queryKey: keys.bootstrap,
    queryFn: async () => (DEMO ? null : api.bootstrap.get()),
    staleTime: 5 * 60_000,
  });
  if (DEMO) return ["new york", "nyc", "san francisco", "bay area"];
  const profile = query.data?.preferences.search_profile;
  return profile ? profileLocationAliases(normalizeSearchProfile(profile)) : [];
}

/* ------------------------------------------------------------- Actions */

/** Apply a change to a job everywhere it is cached. */
function patchJob(client: QueryClient, id: string, patch: Partial<Job>): void {
  client.setQueriesData<InfiniteData<FeedPage>>({ queryKey: keys.feedRoot }, (data) =>
    data
      ? {
          ...data,
          pages: data.pages.map((page) => ({
            ...page,
            jobs: page.jobs.map((job) => (job.id === id ? { ...job, ...patch } : job)),
          })),
        }
      : data,
  );
  client.setQueryData<Job>(keys.job(id), (job) => (job ? { ...job, ...patch } : job));
  for (const key of [keys.saved, keys.applied]) {
    client.setQueryData<Job[]>(key, (jobs) => jobs?.map((job) => (job.id === id ? { ...job, ...patch } : job)));
  }
}

function removeFromFeed(client: QueryClient, id: string): void {
  client.setQueriesData<InfiniteData<FeedPage>>({ queryKey: keys.feedRoot }, (data) =>
    data ? { ...data, pages: data.pages.map((page) => ({ ...page, jobs: page.jobs.filter((job) => job.id !== id) })) } : data,
  );
}

function setInList(client: QueryClient, key: readonly string[], job: Job, present: boolean): void {
  client.setQueryData<Job[]>(key, (jobs) => {
    if (!jobs) return jobs;
    const rest = jobs.filter((candidate) => candidate.id !== job.id);
    return present ? [job, ...rest] : rest;
  });
}

type Action = "save" | "unsave" | "apply" | "unapply" | "hide";

export function useJobAction() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ job, action }: { job: Job; action: Action }): Promise<Job | null> => {
      if (DEMO) return null;
      switch (action) {
        case "save":
          return api.savedJobs.save(job.id);
        case "unsave":
          return api.savedJobs.unsave(job.id);
        case "apply":
          return api.jobs.markApplied(job.id);
        case "unapply":
          return api.jobs.unmarkApplied(job.id);
        case "hide":
          return api.jobs.dismiss(job.id);
      }
    },
    onMutate: ({ job, action }) => {
      const now = new Date().toISOString();
      if (action === "save" || action === "unsave") {
        const saved = action === "save";
        patchJob(client, job.id, { saved });
        setInList(client, keys.saved, { ...job, saved }, saved);
      } else if (action === "apply" || action === "unapply") {
        const applied = action === "apply";
        patchJob(client, job.id, { applied, applied_at: applied ? now : undefined });
        setInList(client, keys.applied, { ...job, applied, applied_at: now }, applied);
        // Applying takes a job out of the feed, the same as on the web.
        if (applied) removeFromFeed(client, job.id);
      } else {
        removeFromFeed(client, job.id);
      }
    },
    onSuccess: (updated) => {
      if (updated) patchJob(client, updated.id, { saved: updated.saved, applied: updated.applied, dismissed: updated.dismissed });
    },
    onError: (error) => {
      void client.invalidateQueries();
      Alert.alert("That didn't go through", error instanceof Error ? error.message : "Please try again.");
    },
    onSettled: (_data, _error, { action }) => {
      if (DEMO) return;
      if (action === "save" || action === "unsave") void client.invalidateQueries({ queryKey: keys.saved });
      if (action === "apply" || action === "unapply") void client.invalidateQueries({ queryKey: keys.applied });
    },
  });
}

export function useMarkViewed() {
  const client = useQueryClient();
  return (id: string) => {
    const viewed = client.getQueryData<Set<string>>(keys.viewed);
    if (viewed?.has(id)) return;
    client.setQueryData<Set<string>>(keys.viewed, (current) => new Set([...(current ?? []), id]));
    if (!DEMO) void api.interactions.markViewed(id).catch(() => undefined);
  };
}
