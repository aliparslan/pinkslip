import { describe, expect, test } from "bun:test";
import type { Job } from "../../../packages/client/src/lib/api";
import {
  JOB_CACHE_MAX_AGE_MS,
  JOB_CACHE_MAX_DETAILS,
  JOB_CACHE_MAX_FEED_JOBS,
  createJobCache,
  fingerprintJobCacheOwner,
  sanitizeCachedJob,
  type DetailRecord,
  type JobCacheStorage,
} from "../src/lib/job-cache";

class MemoryJobCacheStorage implements JobCacheStorage {
  owner: string | null = null;
  feed: Awaited<ReturnType<JobCacheStorage["readFeed"]>> = null;
  details = new Map<string, DetailRecord>();

  async readOwner() { return this.owner; }
  async switchOwner(ownerFingerprint: string | null) {
    if (this.owner !== ownerFingerprint) {
      this.feed = null;
      this.details.clear();
    }
    this.owner = ownerFingerprint;
  }
  async readFeed() { return this.feed; }
  async writeFeed(record: NonNullable<typeof this.feed>) { this.feed = structuredClone(record); }
  async deleteFeed() { this.feed = null; }
  async readDetail(id: string) { return structuredClone(this.details.get(id) ?? null); }
  async writeDetail(record: DetailRecord) { this.details.set(record.key, structuredClone(record)); }
  async deleteDetail(id: string) { this.details.delete(id); }
  async listDetails() { return structuredClone([...this.details.values()]); }
  async clearContent() {
    this.feed = null;
    this.details.clear();
  }
}

function job(id: string): Job {
  return {
    id,
    company_id: "company-secret",
    external_id: `external-${id}`,
    title: `Software Engineer ${id}`,
    url: `https://example.com/jobs/${id}`,
    location: "Chicago, IL",
    department: "Engineering",
    posted_at: "2026-08-27T00:00:00.000Z",
    first_seen_at: "2026-08-27T00:00:00.000Z",
    evergreen: false,
    match_fact: "Personalized for this account",
    dismissed: 1,
    description: "Build useful software.",
    salary: "$100,000–$125,000",
    closed_at: null,
    company_name: "Example Co",
    company_domain: "example.com",
    saved: true,
    applied: true,
    applied_at: "2026-08-28T00:00:00.000Z",
  };
}

describe("web jobs cache", () => {
  test("uses an explicit display-only allowlist", () => {
    const cached = sanitizeCachedJob(job("1"));
    const durableKeys = Object.keys(cached);

    expect(cached.title).toBe("Software Engineer 1");
    expect(durableKeys).not.toContain("company_id");
    expect(durableKeys).not.toContain("external_id");
    expect(durableKeys).not.toContain("match_fact");
    expect(durableKeys).not.toContain("dismissed");
    expect(durableKeys).not.toContain("saved");
    expect(durableKeys).not.toContain("applied");
    expect(durableKeys).not.toContain("applied_at");
  });

  test("hashes the owner identity before storing it", async () => {
    const fingerprint = await fingerprintJobCacheOwner("user-123");
    expect(fingerprint).not.toContain("user-123");
    expect(fingerprint).toHaveLength(43);
    expect(await fingerprintJobCacheOwner("user-123")).toBe(fingerprint);
  });

  test("caps feed snapshots and clears them when the account changes", async () => {
    const storage = new MemoryJobCacheStorage();
    const cache = createJobCache(storage, () => 10_000);
    await cache.setOwner("first@example.com");
    await cache.writeFeed(
      Array.from({ length: JOB_CACHE_MAX_FEED_JOBS + 5 }, (_, index) => job(String(index))),
    );

    expect((await cache.readFeed())?.jobs).toHaveLength(JOB_CACHE_MAX_FEED_JOBS);
    await cache.setOwner("second@example.com");
    expect(await cache.readFeed()).toBeNull();
    expect(await cache.hasReadableJobs()).toBeFalse();
  });

  test("expires feed and detail reads after seven days", async () => {
    let currentTime = 1_000;
    const cache = createJobCache(new MemoryJobCacheStorage(), () => currentTime);
    await cache.setOwner("user@example.com");
    await cache.writeFeed([job("feed")]);
    await cache.writeDetail(job("detail"));

    currentTime += JOB_CACHE_MAX_AGE_MS + 1;
    expect(await cache.readFeed()).toBeNull();
    expect(await cache.readDetail("detail")).toBeNull();
    expect(await cache.hasReadableJobs()).toBeFalse();
  });

  test("retains only the twenty most recently used details", async () => {
    let currentTime = 1_000;
    const cache = createJobCache(new MemoryJobCacheStorage(), () => currentTime);
    await cache.setOwner("user@example.com");

    for (let index = 0; index <= JOB_CACHE_MAX_DETAILS; index += 1) {
      currentTime += 1;
      await cache.writeDetail(job(String(index)));
    }

    expect(await cache.readDetail("0")).toBeNull();
    expect((await cache.readDetail(String(JOB_CACHE_MAX_DETAILS)))?.job.id)
      .toBe(String(JOB_CACHE_MAX_DETAILS));
  });

  test("clearing the owner removes readable cache content", async () => {
    const cache = createJobCache(new MemoryJobCacheStorage(), () => 10_000);
    await cache.setOwner("user@example.com");
    await cache.writeFeed([job("feed")]);
    expect(await cache.hasReadableJobs()).toBeTrue();

    await cache.clearOwner();
    expect(await cache.hasReadableJobs()).toBeFalse();
  });
});
