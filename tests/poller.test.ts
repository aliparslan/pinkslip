import { describe, it, expect } from "bun:test";
import {
  diffJobs,
  mergeListingContent,
  nextQuarantineState,
  processNotificationMatchBacklog,
  QUARANTINE_AFTER_FAILURES,
  runWithConcurrency,
  type NewJobMeta,
  type NotificationBacklogDependencies,
} from "@worker/poller";
import { buildSourceAlertPayload } from "@worker/admin-alerts";
import type { JobListing } from "@worker/adapters/types";

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

describe("diffJobs", () => {
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

  it("returns empty array when fetched list is empty", () => {
    const result = diffJobs([], new Set(["existing-1"]));
    expect(result).toHaveLength(0);
  });
});

describe("mergeListingContent", () => {
  it("uses detail fields without erasing list metadata when detail omits a value", () => {
    const listing = makeJob("job-1", {
      location: "2 US locations",
      postedAt: null,
      salary: "$100K-$120K",
    });
    expect(mergeListingContent(listing, {
      description: "At least 2 years of experience.",
      salary: null,
      location: "San Francisco, CA",
      postedAt: "2026-07-20T00:00:00.000Z",
    })).toMatchObject({
      description: "At least 2 years of experience.",
      salary: "$100K-$120K",
      location: "San Francisco, CA",
      postedAt: "2026-07-20T00:00:00.000Z",
    });
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

describe("nextQuarantineState", () => {
  const NOW = "2026-07-27T12:00:00.000Z";

  it("does not quarantine a transient blip", () => {
    // 46 of 221 sources fail permanently, but timeouts and 502s happen to
    // healthy ones too — those must not be taken out of rotation.
    expect(nextQuarantineState(0, null, NOW)).toEqual({ failureCount: 1, quarantinedAt: null });
    expect(nextQuarantineState(1, null, NOW)).toEqual({ failureCount: 2, quarantinedAt: null });
  });

  it("quarantines once the streak reaches the threshold", () => {
    const state = nextQuarantineState(QUARANTINE_AFTER_FAILURES - 1, null, NOW);
    expect(state.failureCount).toBe(QUARANTINE_AFTER_FAILURES);
    expect(state.quarantinedAt).toBe(NOW);
  });

  it("preserves the original quarantine timestamp across later failures", () => {
    // quarantined_at is the "broken since" value an admin reads. Overwriting it
    // on every 24h retry would make every dead source look newly broken.
    const first = "2026-07-01T09:30:00.000Z";
    const state = nextQuarantineState(12, first, NOW);
    expect(state.failureCount).toBe(13);
    expect(state.quarantinedAt).toBe(first);
  });
});

describe("processNotificationMatchBacklog", () => {
  it("processes every queued job across bounded batches", async () => {
    const queue: NewJobMeta[] = Array.from({ length: 151 }, (_, index) => ({
      company: "Example",
      title: `Software Engineer ${index}`,
      jobId: `job-${index}`,
      listing: makeJob(`external-${index}`, { description: "Build useful software." }),
    }));
    const matched: string[] = [];
    const candidates: string[] = [];
    const dependencies: NotificationBacklogDependencies = {
      load: async (_db, limit) => queue.slice(0, limit),
      match: async (_db, jobs) => {
        matched.push(...jobs.map((job) => job.jobId));
      },
      createCandidates: async (_db, jobIds) => {
        candidates.push(...jobIds);
        return jobIds.length;
      },
      clear: async (_db, jobIds) => {
        const cleared = new Set(jobIds);
        queue.splice(0, queue.length, ...queue.filter((job) => !cleared.has(job.jobId)));
      },
    };
    const db = null as unknown as D1Database;

    expect(await processNotificationMatchBacklog(db, 150, dependencies)).toBe(150);
    expect(queue).toHaveLength(1);
    expect(await processNotificationMatchBacklog(db, 150, dependencies)).toBe(1);

    expect(queue).toHaveLength(0);
    expect(matched).toHaveLength(151);
    expect(candidates).toEqual(matched);
    expect(new Set(candidates).size).toBe(151);
  });

  it("keeps the batch queued when candidate creation fails", async () => {
    const queue = [
      {
        company: "Example",
        title: "Software Engineer",
        jobId: "job-1",
        listing: makeJob("external-1", { description: "Build useful software." }),
      },
    ];
    let cleared = false;
    const dependencies: NotificationBacklogDependencies = {
      load: async () => queue,
      match: async () => undefined,
      createCandidates: async () => {
        throw new Error("temporary database failure");
      },
      clear: async () => {
        cleared = true;
      },
    };

    await expect(
      processNotificationMatchBacklog(null as unknown as D1Database, 150, dependencies)
    ).rejects.toThrow("temporary database failure");
    expect(cleared).toBe(false);
  });
});

describe("buildSourceAlertPayload", () => {
  it("names the broken sources rather than only counting them", () => {
    // The first thing you want to know is whether it is one obscure board or
    // something central, so the companies are named in the body.
    const payload = buildSourceAlertPayload(
      [{ name: "Stripe", error: "Greenhouse API 404" }],
      12
    );
    expect(payload.title).toBe("1 job source stopped working");
    expect(payload.body).toBe("Stripe — 12 total need fixing");
    expect(payload.data.url).toBe("/you/companies");
  });

  it("caps the list and reports the overflow", () => {
    const sources = ["A", "B", "C", "D", "E"].map((name) => ({ name, error: null }));
    const payload = buildSourceAlertPayload(sources, 46);
    expect(payload.title).toBe("5 job sources stopped working");
    expect(payload.body).toBe("A, B, C +2 more — 46 total need fixing");
  });
});
