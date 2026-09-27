import { describe, it, expect } from "bun:test";
import {
  diffJobs,
  fetchPollingSnapshot,
  isTrustworthyJobSnapshot,
  mergeListingContent,
  NEW_JOB_HYDRATION_CHECKPOINT_SIZE,
  NEW_JOB_HYDRATION_LIMIT_PER_COMPANY,
  nextQuarantineState,
  NOTIFICATION_CRON_SCHEDULE,
  NOTIFICATION_MATCH_CHECKPOINT_SIZE,
  processNotificationMatchBacklog,
  processDiscoveredJobCheckpoints,
  QUARANTINE_AFTER_FAILURES,
  rotateDiscoveredJobsForPoll,
  runWithConcurrency,
  shouldQueueNotificationsForCompany,
  SOURCE_JOB_INSPECTION_POLICY_VERSION,
  unresolvedJobReferences,
  type NewJobMeta,
  type NotificationBacklogDependencies,
} from "@worker/poller";
import { isCurrentJobScopeListing } from "@worker/job-scope";
import { scheduledCycle } from "@worker/index";
import { buildSourceAlertPayload } from "@worker/admin-alerts";
import type { JobListing, JobReference } from "@worker/adapters/types";
import type { ATSAdapter } from "@worker/adapters/types";

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

describe("initial source notification policy", () => {
  it("suppresses disabled-source backfills and starts after enablement", () => {
    expect(shouldQueueNotificationsForCompany({ enabled: 0 })).toBe(false);
    expect(shouldQueueNotificationsForCompany({ enabled: 1 })).toBe(true);
  });
});

describe("poll reopening scope", () => {
  it("keeps old software roles reopenable while rejecting filtered research roles", () => {
    const old = "2025-01-01T00:00:00.000Z";
    expect(isCurrentJobScopeListing(makeJob("swe", {
      title: "Software Engineer",
      location: "New York, NY",
      postedAt: old,
    }))).toBe(true);
    expect(isCurrentJobScopeListing(makeJob("research", {
      title: "Bloomberg Intelligence - Credit Research Analyst",
      location: "New York, NY",
      postedAt: old,
    }))).toBe(false);
  });
});

describe("isTrustworthyJobSnapshot", () => {
  it("does not trust an empty response for an established board", () => {
    expect(isTrustworthyJobSnapshot(0, 40)).toBe(false);
    expect(isTrustworthyJobSnapshot(0, 1)).toBe(false);
    expect(isTrustworthyJobSnapshot(0, 0)).toBe(true);
  });

  it("still rejects a suspiciously truncated non-empty snapshot", () => {
    expect(isTrustworthyJobSnapshot(3, 40)).toBe(false);
    expect(isTrustworthyJobSnapshot(20, 40)).toBe(true);
  });
});

describe("fetchPollingSnapshot", () => {
  const content = async () => ({ description: null, salary: null });

  it("uses a bounded discovery feed without marking it authoritative", async () => {
    let fullFetches = 0;
    const adapter: ATSAdapter = {
      name: "large-board",
      fetchDiscoveryJobs: async () => [makeJob("newest")],
      fetchJobs: async () => {
        fullFetches += 1;
        return [makeJob("full")];
      },
      fetchJobContent: content,
    };

    expect(await fetchPollingSnapshot(adapter, "board")).toEqual({
      jobs: [makeJob("newest")],
      complete: false,
    });
    expect(fullFetches).toBe(0);
  });

  it("keeps normal adapter snapshots authoritative", async () => {
    const adapter: ATSAdapter = {
      name: "small-board",
      fetchJobs: async () => [makeJob("full")],
      fetchJobContent: content,
    };

    expect(await fetchPollingSnapshot(adapter, "board")).toEqual({
      jobs: [makeJob("full")],
      complete: true,
    });
  });

  it("uses the authoritative full feed only when explicitly requested", async () => {
    let discoveryFetches = 0;
    const adapter: ATSAdapter = {
      name: "large-board",
      fetchDiscoveryJobs: async () => {
        discoveryFetches += 1;
        return [makeJob("newest")];
      },
      fetchJobs: async () => [makeJob("full")],
      fetchJobContent: content,
    };

    expect(await fetchPollingSnapshot(adapter, "board", "complete")).toEqual({
      jobs: [makeJob("full")],
      complete: true,
    });
    expect(discoveryFetches).toBe(0);
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

describe("processDiscoveredJobCheckpoints", () => {
  function metadataFor(jobs: JobListing[]): NewJobMeta[] {
    return jobs.map((listing) => ({
      company: "Example",
      title: listing.title,
      jobId: `stored-${listing.externalId}`,
      listing,
    }));
  }

  it("caps detail hydration per company and leaves overflow for a later poll", async () => {
    const discovered = Array.from(
      { length: NEW_JOB_HYDRATION_LIMIT_PER_COMPANY + 3 },
      (_, index) => makeJob(`job-${index}`)
    );
    const hydrated: string[] = [];
    const persisted: string[] = [];
    const dependencies = {
      hydrate: async (job: JobListing) => {
        hydrated.push(job.externalId);
        return { ...job, description: "Build reliable systems." };
      },
      accept: () => true,
      persist: async (jobs: JobListing[]) => {
        persisted.push(...jobs.map((job) => job.externalId));
        return metadataFor(jobs);
      },
    };

    const first = await processDiscoveredJobCheckpoints(discovered, dependencies);
    expect(first).toHaveLength(NEW_JOB_HYDRATION_LIMIT_PER_COMPANY);
    expect(hydrated).toHaveLength(NEW_JOB_HYDRATION_LIMIT_PER_COMPANY);
    expect(persisted).toEqual(hydrated);
    expect(hydrated).not.toContain(`job-${NEW_JOB_HYDRATION_LIMIT_PER_COMPANY}`);

    const overflow = discovered.slice(NEW_JOB_HYDRATION_LIMIT_PER_COMPANY);
    const second = await processDiscoveredJobCheckpoints(overflow, dependencies);
    expect(second).toHaveLength(3);
    expect(hydrated.slice(-3)).toEqual(overflow.map((job) => job.externalId));
  });

  it("allows an explicit, still-bounded initial catalog backfill", async () => {
    const discovered = Array.from(
      { length: NEW_JOB_HYDRATION_LIMIT_PER_COMPANY + 5 },
      (_, index) => makeJob(`backfill-${index}`)
    );
    const hydrated: string[] = [];
    const returned = await processDiscoveredJobCheckpoints(discovered, {
      hydrate: async (job) => {
        hydrated.push(job.externalId);
        return { ...job, description: "Build reliable systems." };
      },
      accept: () => true,
      persist: async (jobs) => metadataFor(jobs),
    }, {
      limit: discovered.length,
      limitCeiling: discovered.length,
    });

    expect(returned).toHaveLength(discovered.length);
    expect(hydrated).toEqual(discovered.map((job) => job.externalId));
  });

  it("hydrates lightweight manifest references without placeholder metadata", async () => {
    const references: JobReference[] = ["101", "202"].map((externalId) => ({
      externalId,
      url: `https://example.com/jobs/${externalId}`,
    }));
    const hydrated: string[] = [];
    const returned = await processDiscoveredJobCheckpoints(references, {
      hydrate: async (reference) => {
        hydrated.push(reference.externalId);
        return makeJob(reference.externalId, {
          url: reference.url,
          description: "Build reliable systems.",
        });
      },
      accept: () => true,
      persist: async (jobs) => metadataFor(jobs),
    });

    expect(hydrated).toEqual(["101", "202"]);
    expect(returned.map((job) => job.listing.externalId)).toEqual(hydrated);
  });

  it("persists checkpoints before continuing and compacts cron return metadata", async () => {
    const discovered = Array.from({ length: 9 }, (_, index) => makeJob(`job-${index}`));
    const persistBatches: string[][] = [];
    const returned = await processDiscoveredJobCheckpoints(discovered, {
      hydrate: async (job) => ({ ...job, description: `Large description for ${job.externalId}` }),
      accept: () => true,
      persist: async (jobs) => {
        persistBatches.push(jobs.map((job) => job.externalId));
        return metadataFor(jobs);
      },
    }, { compactReturnMetadata: true });

    expect(persistBatches.map((batch) => batch.length)).toEqual([
      NEW_JOB_HYDRATION_CHECKPOINT_SIZE,
      NEW_JOB_HYDRATION_CHECKPOINT_SIZE,
      1,
    ]);
    expect(returned.map((job) => job.listing.externalId))
      .toEqual(discovered.map((job) => job.externalId));
    expect(returned.every((job) => job.listing.description === null)).toBe(true);
  });

  it("continues later checkpoints when individual detail hydration fails", async () => {
    const discovered = Array.from({ length: 9 }, (_, index) => makeJob(`job-${index}`));
    const persisted: string[] = [];
    const returned = await processDiscoveredJobCheckpoints(discovered, {
      hydrate: async (job) => {
        if (job.externalId === "job-1" || job.externalId === "job-5") {
          throw new Error("temporary detail failure");
        }
        return { ...job, description: "Build reliable systems." };
      },
      accept: () => true,
      persist: async (jobs) => {
        persisted.push(...jobs.map((job) => job.externalId));
        return metadataFor(jobs);
      },
    });

    expect(persisted).toEqual([
      "job-0", "job-2", "job-3",
      "job-4", "job-6", "job-7",
      "job-8",
    ]);
    expect(returned.map((job) => job.listing.externalId)).toEqual(persisted);
  });

  it("checkpoints successful accepted and rejected references but leaves failures retryable", async () => {
    const references: JobReference[] = ["accepted", "filtered", "failed"].map(
      (externalId) => ({
        externalId,
        url: `https://example.com/jobs/${externalId}`,
      })
    );
    const events: string[] = [];
    const resolved: string[] = [];
    const returned = await processDiscoveredJobCheckpoints(references, {
      hydrate: async (reference) => {
        if (reference.externalId === "failed") {
          throw new Error("temporary detail failure");
        }
        return makeJob(reference.externalId, {
          description: reference.externalId === "accepted"
            ? "Build reliable systems."
            : null,
        });
      },
      accept: (job) => Boolean(job.description),
      persist: async (jobs) => {
        events.push("persist");
        return metadataFor(jobs);
      },
      afterCheckpoint: async (outcomes) => {
        events.push("checkpoint");
        resolved.push(...outcomes.flatMap(({ discovered, result }) =>
          result.status === "fulfilled" ? [discovered.externalId] : []
        ));
        expect(outcomes.map((outcome) => outcome.accepted)).toEqual([
          true,
          false,
          false,
        ]);
      },
    });

    expect(events).toEqual(["persist", "checkpoint"]);
    expect(resolved).toEqual(["accepted", "filtered"]);
    expect(returned.map((job) => job.listing.externalId)).toEqual(["accepted"]);
  });

  it("does not checkpoint references when accepted-row persistence fails", async () => {
    let checkpointed = false;
    await expect(processDiscoveredJobCheckpoints([
      { externalId: "new", url: "https://example.com/jobs/new" },
    ], {
      hydrate: async (reference) => makeJob(reference.externalId, {
        description: "Build reliable systems.",
      }),
      accept: () => true,
      persist: async () => {
        throw new Error("database unavailable");
      },
      afterCheckpoint: async () => {
        checkpointed = true;
      },
    })).rejects.toThrow("database unavailable");
    expect(checkpointed).toBe(false);
  });

  it("rotates later valid jobs into the cap across polls when early details stay rejected", async () => {
    const sourceJobs = Array.from({ length: 45 }, (_, index) => makeJob(`job-${index}`));
    const permanentlyRejected = new Set(
      sourceJobs.slice(0, NEW_JOB_HYDRATION_LIMIT_PER_COMPANY)
        .map((job) => job.externalId)
    );
    const persisted = new Set<string>();
    let previousPoll = "2026-08-28T12:00:00.000Z";

    for (let poll = 0; poll < 6; poll += 1) {
      const discovered = sourceJobs.filter((job) => !persisted.has(job.externalId));
      const hydrationOrder = rotateDiscoveredJobsForPoll(discovered, previousPoll);
      await processDiscoveredJobCheckpoints(hydrationOrder, {
        hydrate: async (job) => ({ ...job, description: "Build reliable systems." }),
        accept: (job) => !permanentlyRejected.has(job.externalId),
        persist: async (jobs) => {
          jobs.forEach((job) => persisted.add(job.externalId));
          return metadataFor(jobs);
        },
      });
      previousPoll = new Date(
        Date.parse(previousPoll) + 15 * 60 * 1000
      ).toISOString();
    }

    expect([...persisted].sort()).toEqual(
      sourceJobs.slice(NEW_JOB_HYDRATION_LIMIT_PER_COMPANY)
        .map((job) => job.externalId)
        .sort()
    );
  });
});

describe("unresolvedJobReferences", () => {
  it("hydrates only new or URL-changed identities", () => {
    const references: JobReference[] = [
      { externalId: "stable", url: "https://example.com/jobs/stable" },
      { externalId: "changed", url: "https://example.com/jobs/changed-v2" },
      { externalId: "existing", url: "https://example.com/jobs/existing" },
      { externalId: "blocked", url: "https://example.com/jobs/blocked" },
      { externalId: "new", url: "https://example.com/jobs/new" },
    ];
    const resolved = new Map([
      ["stable", "https://example.com/jobs/stable"],
      ["changed", "https://example.com/jobs/changed-v1"],
    ]);

    expect(unresolvedJobReferences(
      references,
      resolved,
      new Set(["existing"]),
      new Set(["blocked"])
    ).map((reference) => reference.externalId)).toEqual(["changed", "new"]);
  });

  it("rehydrates a reference once when its inspection policy is stale", () => {
    const references: JobReference[] = [
      { externalId: "stale", url: "https://example.com/jobs/stale" },
      { externalId: "current", url: "https://example.com/jobs/current" },
      { externalId: "existing", url: "https://example.com/jobs/existing" },
    ];
    const urls = new Map(references.map((reference) => [
      reference.externalId,
      reference.url,
    ]));
    const policies = new Map([
      ["stale", SOURCE_JOB_INSPECTION_POLICY_VERSION - 1],
      ["current", SOURCE_JOB_INSPECTION_POLICY_VERSION],
      ["existing", SOURCE_JOB_INSPECTION_POLICY_VERSION - 1],
    ]);

    expect(unresolvedJobReferences(
      references,
      urls,
      new Set(["existing"]),
      new Set(),
      policies
    ).map((reference) => reference.externalId)).toEqual(["stale"]);
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
    const matchBatchSizes: number[] = [];
    const dependencies: NotificationBacklogDependencies = {
      load: async (_db, limit) => queue.slice(0, limit),
      match: async (_db, jobs) => {
        matchBatchSizes.push(jobs.length);
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
    expect(matchBatchSizes).toEqual([
      ...Array(6).fill(NOTIFICATION_MATCH_CHECKPOINT_SIZE),
      1,
    ]);
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

  it("keeps completed checkpoints cleared when a later checkpoint fails", async () => {
    const queue: NewJobMeta[] = Array.from({ length: 60 }, (_, index) => ({
      company: "Example",
      title: `Software Engineer ${index}`,
      jobId: `job-${index}`,
      listing: makeJob(`external-${index}`, { description: "Build useful software." }),
    }));
    let candidateCalls = 0;
    const dependencies: NotificationBacklogDependencies = {
      load: async (_db, limit) => queue.slice(0, limit),
      match: async () => undefined,
      createCandidates: async (_db, jobIds) => {
        candidateCalls += 1;
        if (candidateCalls === 2) throw new Error("temporary database failure");
        return jobIds.length;
      },
      clear: async (_db, jobIds) => {
        const cleared = new Set(jobIds);
        queue.splice(0, queue.length, ...queue.filter((job) => !cleared.has(job.jobId)));
      },
    };

    await expect(
      processNotificationMatchBacklog(null as unknown as D1Database, 60, dependencies)
    ).rejects.toThrow("temporary database failure");

    expect(queue).toHaveLength(35);
    expect(queue[0]?.jobId).toBe(`job-${NOTIFICATION_MATCH_CHECKPOINT_SIZE}`);
  });
});

describe("scheduledCycle", () => {
  it("routes the offset cron to a fresh notification invocation", () => {
    expect(scheduledCycle(NOTIFICATION_CRON_SCHEDULE)).toBe("notifications");
    expect(scheduledCycle("*/15 * * * *")).toBe("poll");
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
