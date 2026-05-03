import { describe, it, expect } from "vitest";
import { scoreJob } from "@worker/scoring";
import type { ScoringPrefs } from "@worker/scoring";
import type { JobListing } from "@worker/adapters/types";

const DEFAULT_PREFS: ScoringPrefs = {
  locations: ["Remote", "NYC", "SF", "Dallas"],
  min_yoe: 0,
  max_yoe: 2,
  role_keywords: [
    "software engineer",
    "fullstack",
    "backend",
    "frontend",
    "forward deployed engineer",
  ],
  negative_keywords: [
    "staff",
    "principal",
    "director",
    "intern",
    "manager",
    "senior staff",
    "vp",
    "head of",
  ],
};

function makeJob(overrides: Partial<JobListing>): JobListing {
  return {
    externalId: "test-1",
    title: "Software Engineer",
    url: "https://example.com/jobs/1",
    location: "Remote",
    department: "Engineering",
    postedAt: new Date().toISOString(),
    ...overrides,
  };
}

// Test 1: High score for ideal job
describe("scoreJob", () => {
  it("returns ≥80 for ideal job: Software Engineer Backend + Remote + Engineering + today", () => {
    const job = makeJob({
      title: "Software Engineer, Backend",
      location: "Remote",
      department: "Engineering",
      postedAt: new Date().toISOString(),
    });
    expect(scoreJob(job, DEFAULT_PREFS)).toBeGreaterThanOrEqual(80);
  });

  // Test 2: Low score for senior staff role
  it("returns <30 for Senior Staff Engineer ML Infrastructure in London", () => {
    const job = makeJob({
      title: "Senior Staff Engineer, ML Infrastructure",
      location: "London",
      department: "Engineering",
      postedAt: new Date().toISOString(),
    });
    expect(scoreJob(job, DEFAULT_PREFS)).toBeLessThan(30);
  });

  // Test 3: High score for Forward Deployed Engineer
  it("returns ≥80 for Forward Deployed Engineer + NYC + Engineering", () => {
    const job = makeJob({
      title: "Forward Deployed Engineer",
      location: "NYC",
      department: "Engineering",
      postedAt: new Date().toISOString(),
    });
    expect(scoreJob(job, DEFAULT_PREFS)).toBeGreaterThanOrEqual(80);
  });

  // Test 4: Low score for non-engineering role
  it("returns <30 for Sales Development Representative + Remote + Sales", () => {
    const job = makeJob({
      title: "Sales Development Representative",
      location: "Remote",
      department: "Sales",
      postedAt: new Date().toISOString(),
    });
    expect(scoreJob(job, DEFAULT_PREFS)).toBeLessThan(30);
  });

  // Test 5: Partial location score for empty location string
  it("gives partial location score (10) for empty location string", () => {
    const jobWithLocation = makeJob({
      title: "Software Engineer",
      location: "Remote",
      department: "Engineering",
      postedAt: null,
    });
    const jobWithoutLocation = makeJob({
      title: "Software Engineer",
      location: "",
      department: "Engineering",
      postedAt: null,
    });
    const scoreWithLocation = scoreJob(jobWithLocation, DEFAULT_PREFS);
    const scoreWithoutLocation = scoreJob(jobWithoutLocation, DEFAULT_PREFS);
    // Empty location should score 10 (partial), Remote should score 20
    expect(scoreWithLocation).toBeGreaterThan(scoreWithoutLocation);
    // Verify empty location still adds some points (doesn't zero out)
    expect(scoreWithoutLocation).toBeGreaterThan(0);
  });

  // Test 6: Zero location score for non-preferred city vs Remote scoring 20
  it("gives zero location score for non-preferred city, 20 for Remote", () => {
    const remoteJob = makeJob({
      title: "Software Engineer",
      location: "Remote",
      department: null,
      postedAt: null,
    });
    const nonPreferredJob = makeJob({
      title: "Software Engineer",
      location: "Austin, TX",
      department: null,
      postedAt: null,
    });
    const remoteScore = scoreJob(remoteJob, DEFAULT_PREFS);
    const nonPreferredScore = scoreJob(nonPreferredJob, DEFAULT_PREFS);
    expect(remoteScore).toBeGreaterThan(nonPreferredScore);
    // Difference should be exactly 20 (Remote = 20, non-preferred = 0)
    expect(remoteScore - nonPreferredScore).toBe(20);
  });

  // Test 7: Low score for intern role
  it("returns <30 for Software Engineering Intern + Remote", () => {
    const job = makeJob({
      title: "Software Engineering Intern",
      location: "Remote",
      department: "Engineering",
      postedAt: new Date().toISOString(),
    });
    expect(scoreJob(job, DEFAULT_PREFS)).toBeLessThan(30);
  });

  // Test 8: Recency — today's posting scores higher than 14-day-old posting
  it("scores today's posting higher than a 14-day-old posting", () => {
    const today = new Date().toISOString();
    const oldDate = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();

    const freshJob = makeJob({
      title: "Software Engineer",
      location: "Remote",
      department: "Engineering",
      postedAt: today,
    });
    const oldJob = makeJob({
      title: "Software Engineer",
      location: "Remote",
      department: "Engineering",
      postedAt: oldDate,
    });

    expect(scoreJob(freshJob, DEFAULT_PREFS)).toBeGreaterThan(scoreJob(oldJob, DEFAULT_PREFS));
  });
});
