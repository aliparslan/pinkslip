import type { Job } from "./api";

export interface FeedNavigationItem {
  id: string;
}

let feedNavigationItems: FeedNavigationItem[] = [];

export function setFeedNavigationJobs(jobs: Pick<Job, "id">[]) {
  feedNavigationItems = jobs.map((job) => ({ id: job.id }));
}

export function removeFeedNavigationJob(id: string) {
  feedNavigationItems = feedNavigationItems.filter((job) => job.id !== id);
}

export function getAdjacentJobIds(id: string | null): {
  previousId: string | null;
  nextId: string | null;
} {
  if (!id) return { previousId: null, nextId: null };

  const index = feedNavigationItems.findIndex((job) => job.id === id);
  if (index === -1) return { previousId: null, nextId: null };

  return {
    previousId: feedNavigationItems[index - 1]?.id ?? null,
    nextId: feedNavigationItems[index + 1]?.id ?? null,
  };
}
