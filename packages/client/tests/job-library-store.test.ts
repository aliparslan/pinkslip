import { beforeEach, describe, expect, test } from "bun:test";
import { get } from "svelte/store";
import type { Job } from "@pinkslip/core/api";

const savedJob: Job = {
  id: "saved-1",
  company_id: "company-1",
  external_id: "external-1",
  title: "Software Engineer",
  url: "https://example.com/jobs/1",
  location: "Chicago, IL",
  department: "Engineering",
  posted_at: "2026-08-27T12:00:00.000Z",
  first_seen_at: "2026-08-27T12:00:00.000Z",
  evergreen: false,
  dismissed: 0,
  description: "Build products.",
  salary: null,
  closed_at: null,
  company_name: "Example",
  company_domain: "example.com",
  saved: true,
  applied: false,
};

describe("job Library session cache", () => {
  beforeEach(async () => {
    const { clearJobLibrary } = await import("../src/lib/job-library-store");
    clearJobLibrary();
  });

  test("retains both hydrated collections for a remounted Library route", async () => {
    const {
      jobLibrary,
      replaceAppliedJobs,
      replaceSavedJobs,
    } = await import("../src/lib/job-library-store");
    const appliedJob = { ...savedJob, id: "applied-1", saved: false, applied: true };

    replaceSavedJobs([savedJob]);
    replaceAppliedJobs([appliedJob]);

    const state = get(jobLibrary);
    expect(state.savedHydrated).toBe(true);
    expect(state.appliedHydrated).toBe(true);
    expect(state.savedJobs.map((job) => job.id)).toEqual(["saved-1"]);
    expect(state.appliedJobs.map((job) => job.id)).toEqual(["applied-1"]);
  });

  test("updates hydrated collections after successful save and apply mutations", async () => {
    const {
      jobLibrary,
      replaceAppliedJobs,
      replaceSavedJobs,
      syncCachedLibraryJob,
    } = await import("../src/lib/job-library-store");
    replaceSavedJobs([]);
    replaceAppliedJobs([]);

    syncCachedLibraryJob(savedJob);
    let state = get(jobLibrary);
    expect(state.savedJobs.map((job) => job.id)).toEqual(["saved-1"]);
    expect(state.appliedJobs).toEqual([]);

    syncCachedLibraryJob({ ...savedJob, saved: false, applied: true });
    state = get(jobLibrary);
    expect(state.savedJobs).toEqual([]);
    expect(state.appliedJobs.map((job) => job.id)).toEqual(["saved-1"]);
  });

  test("clears cached jobs when the signed-in owner changes", async () => {
    const {
      jobLibrary,
      replaceSavedJobs,
      setJobLibraryOwner,
    } = await import("../src/lib/job-library-store");
    setJobLibraryOwner("user-a");
    replaceSavedJobs([savedJob]);

    setJobLibraryOwner("user-b");

    const state = get(jobLibrary);
    expect(state.savedJobs).toEqual([]);
    expect(state.savedHydrated).toBe(false);
  });
});
