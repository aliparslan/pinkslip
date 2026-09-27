import { describe, expect, it } from "bun:test";
import {
  indexManualPollJobs,
  type ManualPollIndexDependencies,
} from "@worker/routes/companies";
import type { NewJobMeta } from "@worker/poller";

const jobs: NewJobMeta[] = [{
  company: "Example",
  title: "Software Engineer",
  jobId: "job-1",
  listing: {
    externalId: "external-1",
    title: "Software Engineer",
    url: "https://example.com/jobs/1",
    location: "New York, NY, United States",
    department: "Engineering",
    postedAt: "2026-08-30T00:00:00.000Z",
    description: "Build reliable software.",
    salary: null,
  },
}];

describe("manual company poll indexing", () => {
  it("indexes a disabled backfill for feeds without creating notifications", async () => {
    const matched: string[] = [];
    let notified = false;
    const dependencies: ManualPollIndexDependencies = {
      match: async (_db, inputs) => {
        matched.push(...inputs.map((input) => input.jobId));
      },
      notify: async () => {
        notified = true;
        return 1;
      },
    };

    const sent = await indexManualPollJobs(
      null as unknown as D1Database,
      null as never,
      { enabled: 0 },
      jobs,
      dependencies
    );

    expect(matched).toEqual(["job-1"]);
    expect(notified).toBe(false);
    expect(sent).toBe(0);
  });

  it("indexes and notifies for an enabled source", async () => {
    const events: string[] = [];
    const dependencies: ManualPollIndexDependencies = {
      match: async () => {
        events.push("match");
      },
      notify: async () => {
        events.push("notify");
        return 1;
      },
    };

    const sent = await indexManualPollJobs(
      null as unknown as D1Database,
      null as never,
      { enabled: 1 },
      jobs,
      dependencies
    );

    expect(events).toEqual(["match", "notify"]);
    expect(sent).toBe(1);
  });
});
