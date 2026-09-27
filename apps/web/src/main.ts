import App from "./WebApp.svelte";
import { initializeWebPlatform } from "./platform";
import { mountApp } from "../../../packages/client/src/mount-app";
import type { Job } from "../../../packages/client/src/lib/api";
import { installJobReadCache } from "../../../packages/client/src/lib/job-read-cache";
import {
  createHistoryNavigationAdapter,
  installNavigationAdapter,
} from "../../../packages/client/src/router";
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
import "../../../packages/client/src/app.css";
import "./web.css";

installNavigationAdapter(createHistoryNavigationAdapter());

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

await initializeWebPlatform();
const app = await mountApp(App);

export default app;
