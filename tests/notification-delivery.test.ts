import { describe, expect, test } from "bun:test";
import {
  failureStatusAfterAttempt,
  notificationJobIdBatches,
  notificationJobMatchesCurrentProfile,
} from "@worker/notification-delivery";
import { classifyJob } from "@worker/job-features";
import { normalizeSearchProfile } from "../shared/search-profile";
import type { JobListing } from "@worker/adapters/types";

describe("notification delivery retries", () => {
  test("retries the first two failed attempts", () => {
    expect(failureStatusAfterAttempt(0)).toBe("retry");
    expect(failureStatusAfterAttempt(1)).toBe("retry");
  });

  test("stops retrying after the third failed attempt", () => {
    expect(failureStatusAfterAttempt(2)).toBe("failed");
  });

  test("keeps large candidate queries below D1's bound-parameter limit", () => {
    const ids = Array.from({ length: 682 }, (_, index) => `job-${index}`);
    const batches = notificationJobIdBatches([...ids, ids[0]]);

    expect(Math.max(...batches.map((batch) => batch.length))).toBe(75);
    expect(batches.flat()).toEqual(ids);
    expect(batches).toHaveLength(10);
  });

  test("rechecks live career-stage and role preferences before delivery", () => {
    const internship: JobListing = {
      externalId: "intern-1",
      title: "Software Engineering Intern",
      url: "https://example.com/jobs/intern-1",
      location: "San Francisco, CA",
      department: "Engineering",
      postedAt: new Date().toISOString(),
      description: "Build production software with the engineering team.",
      salary: null,
    };
    const features = classifyJob(internship);
    const internshipProfile = normalizeSearchProfile({
      version: 4,
      target_levels: ["internship"],
      roles: ["software_engineering"],
      onboarding_version: 3,
      onboarding_completed_at: new Date().toISOString(),
    });
    const earlyCareerProfile = normalizeSearchProfile({
      ...internshipProfile,
      target_levels: ["new_grad", "early_career"],
    });
    const researchOnlyProfile = normalizeSearchProfile({
      ...internshipProfile,
      roles: ["research"],
    });

    expect(notificationJobMatchesCurrentProfile(
      internship.externalId,
      internship,
      features,
      internshipProfile
    )).toBe(true);
    expect(notificationJobMatchesCurrentProfile(
      internship.externalId,
      internship,
      features,
      earlyCareerProfile
    )).toBe(false);
    expect(notificationJobMatchesCurrentProfile(
      internship.externalId,
      internship,
      features,
      researchOnlyProfile
    )).toBe(false);
  });
});
