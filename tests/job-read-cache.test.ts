import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { api, type Job } from "../packages/core/src/api";
import {
  installJobReadCache,
  jobReadPresentation,
  readJobsList,
  type CachedRead,
  type JobReadCacheAdapter,
} from "../packages/client/src/lib/job-read-cache";

const job: Job = {
  id: "job-1",
  company_id: "company-1",
  external_id: "external-1",
  title: "Product Engineer",
  url: "https://example.com/jobs/1",
  location: "Chicago, IL",
  department: "Engineering",
  posted_at: "2026-08-27T12:00:00.000Z",
  first_seen_at: "2026-08-27T12:00:00.000Z",
  evergreen: false,
  dismissed: 0,
  description: "Build thoughtful products.",
  salary: "$120k–$150k",
  closed_at: null,
  company_name: "Example",
  company_domain: "example.com",
};

const originalList = api.jobs.list;

function readPresentation() {
  let value = { readOnly: false, savedAt: null as number | null };
  const unsubscribe = jobReadPresentation.subscribe((next) => { value = next; });
  unsubscribe();
  return value;
}

describe("job read cache runtime", () => {
  let cachedFeed: CachedRead<{ jobs: Job[]; meta: { total: number } }> | null;
  let writes = 0;

  beforeEach(() => {
    cachedFeed = {
      value: { jobs: [job], meta: { total: 1 } },
      savedAt: Date.now() - 1_000,
    };
    writes = 0;
    const adapter: JobReadCacheAdapter = {
      setOwner: async () => undefined,
      clear: async () => undefined,
      hasReadableJobs: async () => Boolean(cachedFeed),
      readFeed: async () => cachedFeed,
      writeFeed: async () => { writes += 1; },
      readDetail: async () => null,
      writeDetail: async () => undefined,
    };
    installJobReadCache(adapter);
    jobReadPresentation.set({ readOnly: false, savedAt: null });
  });

  afterEach(() => {
    api.jobs.list = originalList;
  });

  test("falls back to the saved feed and enters read-only mode", async () => {
    api.jobs.list = async () => { throw new Error("offline"); };

    const result = await readJobsList({ limit: "50", offset: "0" });

    expect(result.source).toBe("cache");
    expect(result.jobs).toEqual([job]);
    expect(readPresentation()).toEqual({
      readOnly: true,
      savedAt: cachedFeed?.savedAt ?? null,
    });
  });

  test("does not substitute the first page for failed pagination", async () => {
    api.jobs.list = async () => { throw new Error("offline"); };

    expect(readJobsList({ limit: "25", offset: "25" })).rejects.toThrow("offline");
  });

  test("writes successful first-page reads and leaves read-only mode", async () => {
    jobReadPresentation.set({ readOnly: true, savedAt: Date.now() });
    api.jobs.list = async () => ({ jobs: [job], meta: { total: 1 } });

    const result = await readJobsList({ limit: "50", offset: "0" });
    await Promise.resolve();

    expect(result.source).toBe("network");
    expect(writes).toBe(1);
    expect(readPresentation().readOnly).toBe(false);
  });
});
