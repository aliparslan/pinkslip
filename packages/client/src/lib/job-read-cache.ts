import { writable } from "svelte/store";
import { api, type Job, type JobsListMeta, type JobsListParams } from "./api";

export interface CachedRead<T> {
  value: T;
  savedAt: number;
}

export interface JobReadCacheAdapter {
  setOwner(userId: string | null): Promise<void>;
  clear(): Promise<void>;
  hasReadableJobs(): Promise<boolean>;
  readFeed(): Promise<CachedRead<{ jobs: Job[]; meta: JobsListMeta }> | null>;
  writeFeed(value: { jobs: Job[]; meta: JobsListMeta }): Promise<void>;
  readDetail(id: string): Promise<CachedRead<Job> | null>;
  writeDetail(job: Job): Promise<void>;
}

export interface JobReadPresentation {
  readonly readOnly: boolean;
  readonly savedAt: number | null;
}

export const jobReadPresentation = writable<JobReadPresentation>({
  readOnly: false,
  savedAt: null,
});

let adapter: JobReadCacheAdapter | null = null;

export function installJobReadCache(nextAdapter: JobReadCacheAdapter): void {
  adapter = nextAdapter;
}

export async function setJobReadCacheOwner(userId: string | null): Promise<void> {
  await adapter?.setOwner(userId);
}

export async function clearJobReadCache(): Promise<void> {
  await adapter?.clear();
  jobReadPresentation.set({ readOnly: false, savedAt: null });
}

export async function hasReadableJobCache(): Promise<boolean> {
  return adapter ? adapter.hasReadableJobs() : false;
}

export function leaveCachedReadMode(): void {
  jobReadPresentation.set({ readOnly: false, savedAt: null });
}

function enterCachedReadMode(savedAt: number): void {
  jobReadPresentation.set({ readOnly: true, savedAt });
}

export async function readJobsList(
  params?: JobsListParams
): Promise<{ jobs: Job[]; meta: JobsListMeta; source: "network" | "cache"; savedAt: number | null }> {
  try {
    const value = await api.jobs.list(params);
    leaveCachedReadMode();
    if (!params?.offset || params.offset === "0") {
      void adapter?.writeFeed(value).catch(() => undefined);
    }
    return { ...value, source: "network", savedAt: null };
  } catch (error) {
    if (params?.offset && params.offset !== "0") throw error;
    const cached = await adapter?.readFeed();
    if (!cached) throw error;
    enterCachedReadMode(cached.savedAt);
    return { ...cached.value, source: "cache", savedAt: cached.savedAt };
  }
}

export async function readJobDetail(
  id: string
): Promise<{ job: Job; source: "network" | "cache"; savedAt: number | null }> {
  try {
    const job = await api.jobs.get(id);
    leaveCachedReadMode();
    void adapter?.writeDetail(job).catch(() => undefined);
    return { job, source: "network", savedAt: null };
  } catch (error) {
    const cached = await adapter?.readDetail(id);
    if (!cached) throw error;
    enterCachedReadMode(cached.savedAt);
    return { job: cached.value, source: "cache", savedAt: cached.savedAt };
  }
}
