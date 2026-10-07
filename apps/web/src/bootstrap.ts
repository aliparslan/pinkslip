import { initializeWebPlatform } from "./platform";
import type { Job } from "@pinkslip/core/api";
import { installJobReadCache } from "../../../packages/client/src/lib/job-read-cache";
import {
  clearCachedJobs,
  clearJobCacheOwner,
  hasReadableJobs,
  readCachedFeed,
  readCachedJobDetail,
  setJobCacheOwner,
  type CachedJob,
  writeCachedFeed,
  writeCachedJobDetail,
} from "./lib/job-cache";

function restoreCachedJob(job: CachedJob): Job {
  return {
    ...job,
    // Mutation state is deliberately never persisted. Cached reads are
    // read-only, so this value only satisfies the shared display contract.
    company_id: "",
    external_id: "",
    dismissed: 0,
  };
}

export function initializeWebClient(navigateFromNotification: (url: string) => Promise<void>): () => void {
  installJobReadCache({
    async setOwner(userId) {
      if (userId) await setJobCacheOwner(userId);
      else await clearJobCacheOwner();
    },
    clear: clearCachedJobs,
    hasReadableJobs,
    async readFeed() {
      const cached = await readCachedFeed();
      if (!cached) return null;
      const jobs = cached.jobs.map(restoreCachedJob);
      return {
        value: {
          jobs,
          meta: { total: jobs.length, count: jobs.length, has_more: false },
        },
        savedAt: cached.cachedAt,
      };
    },
    async writeFeed(value) {
      await writeCachedFeed(value.jobs);
    },
    async readDetail(id) {
      const cached = await readCachedJobDetail(id);
      return cached
        ? { value: restoreCachedJob(cached.job), savedAt: cached.cachedAt }
        : null;
    },
    writeDetail: writeCachedJobDetail,
  });

  return initializeWebPlatform(navigateFromNotification);
}
