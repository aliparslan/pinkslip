import { describe, it, expect } from "bun:test";
import { diffJobs, runWithConcurrency } from "@worker/poller";
import type { JobListing } from "@worker/adapters/types";

// ─── Helper ──────────────────────────────────────────────────────────────────

function makeJob(externalId: string, overrides: Partial<JobListing> = {}): JobListing {
  return {
    externalId,
    title: "Software Engineer",
    url: `https://example.com/jobs/${externalId}`,
    location: "Remote",
    department: "Engineering",
    postedAt: new Date().toISOString(),
    description: null,
    salary: null,
    ...overrides,
  };
}

// ─── diffJobs tests ──────────────────────────────────────────────────────────

describe("diffJobs", () => {
  // Test 1: Identifies new jobs not in existing set
  it("returns only jobs whose externalId is not in existingExternalIds", () => {
    const fetched: JobListing[] = [
      makeJob("job-1"),
      makeJob("job-2"),
      makeJob("job-3"),
    ];
    const existingIds = new Set<string>(["job-1"]);

    const result = diffJobs(fetched, existingIds);

    expect(result).toHaveLength(2);
    expect(result.map((j) => j.externalId)).toEqual(
      expect.arrayContaining(["job-2", "job-3"])
    );
    expect(result.map((j) => j.externalId)).not.toContain("job-1");
  });

  // Test 2: Returns all jobs when none exist
  it("returns all fetched jobs when existing set is empty", () => {
    const fetched: JobListing[] = [
      makeJob("new-1"),
      makeJob("new-2"),
    ];
    const existingIds = new Set<string>();

    const result = diffJobs(fetched, existingIds);

    expect(result).toHaveLength(2);
    expect(result.map((j) => j.externalId)).toEqual(
      expect.arrayContaining(["new-1", "new-2"])
    );
  });

  // Test 3: Returns empty when all jobs exist
  it("returns empty array when all fetched jobs are already in existingExternalIds", () => {
    const fetched: JobListing[] = [
      makeJob("known-1"),
      makeJob("known-2"),
    ];
    const existingIds = new Set<string>(["known-1", "known-2"]);

    const result = diffJobs(fetched, existingIds);

    expect(result).toHaveLength(0);
    expect(result).toEqual([]);
  });

  // Extra: Empty fetch list returns empty
  it("returns empty array when fetched list is empty", () => {
    const result = diffJobs([], new Set(["existing-1"]));
    expect(result).toHaveLength(0);
  });
});

describe("runWithConcurrency", () => {
  it("preserves input order while limiting concurrency", async () => {
    const started: number[] = [];
    const finished: number[] = [];
    let active = 0;
    let maxActive = 0;

    const results = await runWithConcurrency([1, 2, 3, 4], 2, async (item) => {
      started.push(item);
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, item % 2 === 0 ? 5 : 1));
      active--;
      finished.push(item);
      return item * 2;
    });

    expect(maxActive).toBeLessThanOrEqual(2);
    expect(started).toHaveLength(4);
    expect(finished).toHaveLength(4);
    expect(results).toEqual([
      { status: "fulfilled", value: 2 },
      { status: "fulfilled", value: 4 },
      { status: "fulfilled", value: 6 },
      { status: "fulfilled", value: 8 },
    ]);
  });
});
