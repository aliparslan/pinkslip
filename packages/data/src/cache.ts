import type { Job } from "@pinkslip/core/api";
import type { QueryClient, QueryKey } from "@tanstack/react-query";
import { queryKeys } from "./keys";

export interface JobsCollection {
  jobs: Job[];
}

type Snapshot = [QueryKey, unknown][];
export type Restore = () => void;

function snapshot(queryClient: QueryClient, key: QueryKey): Snapshot {
  return queryClient.getQueriesData({ queryKey: key });
}

function restoreAll(queryClient: QueryClient, snapshots: Snapshot[]): Restore {
  return () => {
    for (const entries of snapshots) {
      for (const [key, data] of entries) queryClient.setQueryData(key, data);
    }
  };
}

function updateCollections(queryClient: QueryClient, key: QueryKey, update: (jobs: Job[]) => Job[]): void {
  queryClient.setQueriesData<JobsCollection>({ queryKey: key }, (previous) =>
    previous ? { ...previous, jobs: update(previous.jobs) } : previous);
}

function upsert(jobs: Job[], job: Job): Job[] {
  const index = jobs.findIndex((entry) => entry.id === job.id);
  if (index < 0) return [job, ...jobs];
  return jobs.map((entry) => (entry.id === job.id ? { ...entry, ...job } : entry));
}

/** Optimistically mark a job saved/unsaved and return the rollback. The saved
 * list only gains an entry once the full job is known (mutation success). */
export function setJobSaved(queryClient: QueryClient, id: string, saved: boolean, job?: Job): Restore {
  const snapshots = [
    snapshot(queryClient, queryKeys.personal.job(id)),
    snapshot(queryClient, queryKeys.personal.saved()),
  ];
  queryClient.setQueryData<Job>(queryKeys.personal.job(id), (previous) => {
    const next = job ? (previous ? { ...previous, ...job } : job) : previous;
    return next ? { ...next, saved } : next;
  });
  updateCollections(queryClient, queryKeys.personal.saved(), (jobs) => {
    if (!saved) return jobs.filter((entry) => entry.id !== id);
    return job ? upsert(jobs, job) : jobs;
  });
  return restoreAll(queryClient, snapshots);
}

/** Optimistically mark applied/unapplied: discovery lists drop applied jobs,
 * and the applied list gains or loses the entry. */
export function setJobApplied(queryClient: QueryClient, job: Job, applied: boolean): Restore {
  const snapshots = [
    snapshot(queryClient, queryKeys.personal.job(job.id)),
    snapshot(queryClient, queryKeys.personal.applied()),
    snapshot(queryClient, queryKeys.personal.jobsRoot),
  ];
  const patch = applied
    ? { applied: true as const, dismissed: 1 }
    : { applied: false as const, dismissed: 0 };
  queryClient.setQueryData<Job>(queryKeys.personal.job(job.id), (previous) =>
    previous ? { ...previous, ...job, ...patch } : { ...job, ...patch });
  updateCollections(queryClient, queryKeys.personal.applied(), (jobs) =>
    applied ? upsert(jobs, { ...job, ...patch }) : jobs.filter((entry) => entry.id !== job.id));
  updateCollections(queryClient, queryKeys.personal.jobsRoot, (jobs) =>
    applied ? jobs.filter((entry) => entry.id !== job.id) : jobs);
  return restoreAll(queryClient, snapshots);
}

/** Optimistically drop a job from every discovery list (hide, admin block)
 * and return the rollback, which puts it back where it was. */
export function removeJobFromLists(queryClient: QueryClient, id: string): Restore {
  const snapshots = [snapshot(queryClient, queryKeys.personal.jobsRoot)];
  updateCollections(queryClient, queryKeys.personal.jobsRoot, (jobs) => jobs.filter((entry) => entry.id !== id));
  return restoreAll(queryClient, snapshots);
}

/** Optimistically add or remove a job id from the viewed set; returns the rollback. */
export function setJobViewed(queryClient: QueryClient, id: string, viewed: boolean): Restore {
  const previous = queryClient.getQueryData<string[]>(queryKeys.personal.viewed());
  queryClient.setQueryData<string[]>(queryKeys.personal.viewed(), (ids = []) => {
    const without = ids.filter((entry) => entry !== id);
    return viewed ? [...without, id] : without;
  });
  return () => queryClient.setQueryData(queryKeys.personal.viewed(), previous);
}
