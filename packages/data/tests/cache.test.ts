import { describe, expect, test } from "bun:test";
import type { Job } from "@pinkslip/core/api";
import { removeJobFromLists, setJobApplied, setJobSaved, setJobViewed } from "../src/cache";
import { queryKeys } from "../src/keys";
import { createAppQueryClient } from "../src/query-client";
import { makeJob } from "./job-fixture";

function seeded(savedJobs: Job[] = []) {
  const client = createAppQueryClient();
  const job = makeJob();
  client.setQueryData(queryKeys.personal.job(job.id), job);
  client.setQueryData(queryKeys.personal.saved(), { jobs: savedJobs });
  client.setQueryData(queryKeys.personal.applied(), { jobs: [] });
  client.setQueryData(queryKeys.personal.jobs({ limit: "20" }), { jobs: [job], meta: { total: 1 } });
  return { client, job };
}

const collection = (client: ReturnType<typeof createAppQueryClient>, key: readonly unknown[]) =>
  client.getQueryData<{ jobs: Job[] }>(key)?.jobs.map((entry) => entry.id);
const detail = (client: ReturnType<typeof createAppQueryClient>, id: string) =>
  client.getQueryData<Job>(queryKeys.personal.job(id));

describe("optimistic job cache updates", () => {
  test("saving marks the detail and upserts the saved list", () => {
    const { client, job } = seeded();
    const rollback = setJobSaved(client, job.id, true, job);

    expect(detail(client, job.id)?.saved).toBe(true);
    expect(collection(client, queryKeys.personal.saved())).toEqual([job.id]);

    rollback();
    expect(detail(client, job.id)?.saved).toBeUndefined();
    expect(collection(client, queryKeys.personal.saved())).toEqual([]);
  });

  test("unsaving removes the saved entry and rolls back", () => {
    const { client, job } = seeded([makeJob({ saved: true })]);
    const rollback = setJobSaved(client, job.id, false);

    expect(detail(client, job.id)?.saved).toBe(false);
    expect(collection(client, queryKeys.personal.saved())).toEqual([]);

    rollback();
    expect(collection(client, queryKeys.personal.saved())).toEqual([job.id]);
  });

  test("applying removes the job from discovery and adds it to applied", () => {
    const { client, job } = seeded();
    const rollback = setJobApplied(client, job, true);

    expect(detail(client, job.id)?.applied).toBe(true);
    expect(detail(client, job.id)?.dismissed).toBe(1);
    expect(collection(client, queryKeys.personal.applied())).toEqual([job.id]);
    expect(collection(client, queryKeys.personal.jobs({ limit: "20" }))).toEqual([]);

    rollback();
    expect(detail(client, job.id)?.applied).toBeUndefined();
    expect(collection(client, queryKeys.personal.applied())).toEqual([]);
    expect(collection(client, queryKeys.personal.jobs({ limit: "20" }))).toEqual([job.id]);
  });

  test("unapplying removes the applied entry", () => {
    const client = createAppQueryClient();
    const job = makeJob({ applied: true, dismissed: 1 });
    client.setQueryData(queryKeys.personal.applied(), { jobs: [job] });
    client.setQueryData(queryKeys.personal.job(job.id), job);

    const rollback = setJobApplied(client, job, false);

    expect(collection(client, queryKeys.personal.applied())).toEqual([]);
    expect(detail(client, job.id)?.applied).toBe(false);

    rollback();
    expect(collection(client, queryKeys.personal.applied())).toEqual([job.id]);
  });
});

describe("hide, block and read state", () => {
  test("removing a job drops it from every discovery list and restores its place", () => {
    const client = createAppQueryClient();
    const jobs = ["a", "b", "c"].map((id) => makeJob({ id }));
    client.setQueryData(queryKeys.personal.jobs({ limit: "20" }), { jobs, meta: { total: 3 } });
    client.setQueryData(queryKeys.personal.jobs({ q: "eng" }), { jobs: [jobs[1]], meta: { total: 1 } });

    const restore = removeJobFromLists(client, "b");
    expect(collection(client, queryKeys.personal.jobs({ limit: "20" }))).toEqual(["a", "c"]);
    expect(collection(client, queryKeys.personal.jobs({ q: "eng" }))).toEqual([]);

    restore();
    expect(collection(client, queryKeys.personal.jobs({ limit: "20" }))).toEqual(["a", "b", "c"]);
    expect(collection(client, queryKeys.personal.jobs({ q: "eng" }))).toEqual(["b"]);
  });

  test("read state toggles in the viewed set and rolls back", () => {
    const client = createAppQueryClient();
    client.setQueryData(queryKeys.personal.viewed(), ["a"]);

    const rollback = setJobViewed(client, "b", true);
    expect(client.getQueryData<string[]>(queryKeys.personal.viewed())).toEqual(["a", "b"]);
    setJobViewed(client, "a", false);
    expect(client.getQueryData<string[]>(queryKeys.personal.viewed())).toEqual(["b"]);

    rollback();
    expect(client.getQueryData<string[]>(queryKeys.personal.viewed())).toEqual(["a"]);
  });
});
