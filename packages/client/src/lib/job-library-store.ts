import { writable } from "svelte/store";
import { onJobMutation, type Job } from "@pinkslip/core/api";

export interface JobLibraryState {
  savedJobs: Job[];
  appliedJobs: Job[];
  savedHydrated: boolean;
  appliedHydrated: boolean;
}

function emptyState(): JobLibraryState {
  return {
    savedJobs: [],
    appliedJobs: [],
    savedHydrated: false,
    appliedHydrated: false,
  };
}

/**
 * Session-scoped Library state. Saved and Applied are sibling routes backed by
 * the same screen, so component-local arrays would disappear whenever the
 * router remounted that screen to switch tabs. Keeping the last successful
 * collections here lets the next instance render immediately while refreshing
 * them in the background.
 */
export const jobLibrary = writable<JobLibraryState>(emptyState());

let ownerId: string | null | undefined;

function upsert(jobs: Job[], nextJob: Job): Job[] {
  const existingIndex = jobs.findIndex((job) => job.id === nextJob.id);
  if (existingIndex < 0) return [nextJob, ...jobs];
  return jobs.map((job, index) => index === existingIndex ? nextJob : job);
}

export function replaceSavedJobs(jobs: Job[]): void {
  jobLibrary.update((state) => ({ ...state, savedJobs: jobs, savedHydrated: true }));
}

export function replaceAppliedJobs(jobs: Job[]): void {
  jobLibrary.update((state) => ({ ...state, appliedJobs: jobs, appliedHydrated: true }));
}

/** Keep an already-hydrated Library coherent with successful job mutations. */
export function syncCachedLibraryJob(job: Job): void {
  jobLibrary.update((state) => ({
    ...state,
    savedJobs: state.savedHydrated
      ? job.saved
        ? upsert(state.savedJobs, job)
        : state.savedJobs.filter((candidate) => candidate.id !== job.id)
      : state.savedJobs,
    appliedJobs: state.appliedHydrated
      ? job.applied
        ? upsert(state.appliedJobs, job)
        : state.appliedJobs.filter((candidate) => candidate.id !== job.id)
      : state.appliedJobs,
  }));
}

// Library lists only sync once hydrated, and hydration requires this module,
// so registering on first import preserves the previous always-in-sync behavior.
onJobMutation(syncCachedLibraryJob);

export function clearJobLibrary(): void {
  jobLibrary.set(emptyState());
}

/** Prevent one signed-in account's in-memory Library from reaching another. */
export function setJobLibraryOwner(userId: string | null): void {
  if (ownerId === undefined) {
    ownerId = userId;
    return;
  }
  if (ownerId === userId) return;
  ownerId = userId;
  clearJobLibrary();
}
