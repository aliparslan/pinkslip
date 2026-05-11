import { describe, it, expect } from "bun:test";
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
    "lead",
    "vice president",
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
    description: null,
    salary: null,
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
    expect(scoreJob(job, DEFAULT_PREFS).score).toBeGreaterThanOrEqual(80);
  });

  // Test 2: Low score for senior staff role
  it("returns <30 for Senior Staff Engineer ML Infrastructure in London", () => {
    const job = makeJob({
      title: "Senior Staff Engineer, ML Infrastructure",
      location: "London",
      department: "Engineering",
      postedAt: new Date().toISOString(),
    });
    expect(scoreJob(job, DEFAULT_PREFS).score).toBeLessThan(30);
  });

  // Test 3: High score for Forward Deployed Engineer
  it("returns ≥80 for Forward Deployed Engineer + NYC + Engineering", () => {
    const job = makeJob({
      title: "Forward Deployed Engineer",
      location: "NYC",
      department: "Engineering",
      postedAt: new Date().toISOString(),
    });
    expect(scoreJob(job, DEFAULT_PREFS).score).toBeGreaterThanOrEqual(80);
  });

  // Test 4: Low score for non-engineering role
  it("returns <30 for Sales Development Representative + Remote + Sales", () => {
    const job = makeJob({
      title: "Sales Development Representative",
      location: "Remote",
      department: "Sales",
      postedAt: new Date().toISOString(),
    });
    expect(scoreJob(job, DEFAULT_PREFS).score).toBeLessThan(30);
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
    const scoreWithLocation = scoreJob(jobWithLocation, DEFAULT_PREFS).score;
    const scoreWithoutLocation = scoreJob(jobWithoutLocation, DEFAULT_PREFS).score;
    expect(scoreWithLocation).toBeGreaterThan(scoreWithoutLocation);
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
    const remoteScore = scoreJob(remoteJob, DEFAULT_PREFS).score;
    const nonPreferredScore = scoreJob(nonPreferredJob, DEFAULT_PREFS).score;
    expect(remoteScore).toBeGreaterThan(nonPreferredScore);
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
    expect(scoreJob(job, DEFAULT_PREFS).score).toBeLessThan(30);
  });

  it("does not auto-disqualify architect titles that still look like IC software roles", () => {
    const architectJob = makeJob({
      title: "Solutions Architect",
      location: "Remote",
      department: "Engineering",
      postedAt: new Date().toISOString(),
    });

    expect(scoreJob(architectJob, DEFAULT_PREFS).score).toBeGreaterThanOrEqual(29);
  });

  it("filters lead, vice president, and sr titles more aggressively", () => {
    const leadJob = makeJob({
      title: "Technical Lead, Platform",
      location: "Remote",
      department: "Engineering",
      postedAt: new Date().toISOString(),
    });
    const vpJob = makeJob({
      title: "Vice President of Engineering",
      location: "Remote",
      department: "Engineering",
      postedAt: new Date().toISOString(),
    });
    const srJob = makeJob({
      title: "Sr Software Engineer",
      location: "Remote",
      department: "Engineering",
      postedAt: new Date().toISOString(),
    });

    expect(scoreJob(leadJob, DEFAULT_PREFS).score).toBeLessThan(30);
    expect(scoreJob(vpJob, DEFAULT_PREFS).score).toBeLessThan(30);
    expect(scoreJob(srJob, DEFAULT_PREFS).score).toBeLessThan(30);
  });

  it("uses the job description for YOE scoring instead of relying on the title", () => {
    const juniorRange = makeJob({
      title: "Software Engineer",
      description: "<p>You have 1-2 years of experience building product systems.</p>",
      location: "Remote",
      department: "Engineering",
      postedAt: null,
    });
    const seniorRange = makeJob({
      title: "Software Engineer",
      description: "<p>You have 6+ years of experience leading complex distributed systems.</p>",
      location: "Remote",
      department: "Engineering",
      postedAt: null,
    });

    expect(scoreJob(juniorRange, DEFAULT_PREFS).yoe_score).toBe(25);
    expect(scoreJob(seniorRange, DEFAULT_PREFS).yoe_score).toBe(0);
    expect(scoreJob(juniorRange, DEFAULT_PREFS).score).toBeGreaterThan(scoreJob(seniorRange, DEFAULT_PREFS).score);
  });

  it("does not surface non-software engineering titles just because they say engineer", () => {
    const mechanicalJob = makeJob({
      title: "Mechanical Engineer",
      location: "Remote",
      department: "Engineering",
      postedAt: new Date().toISOString(),
    });
    const chemicalJob = makeJob({
      title: "Chemical Engineer",
      location: "Remote",
      department: "Engineering",
      postedAt: new Date().toISOString(),
    });
    const dataJob = makeJob({
      title: "Data Engineer",
      location: "Remote",
      department: "Engineering",
      postedAt: new Date().toISOString(),
    });

    expect(scoreJob(mechanicalJob, DEFAULT_PREFS).score).toBeLessThan(30);
    expect(scoreJob(chemicalJob, DEFAULT_PREFS).score).toBeLessThan(30);
    expect(scoreJob(dataJob, DEFAULT_PREFS).score).toBeGreaterThan(50);
  });

  it("excludes remote roles that are explicitly outside the us", () => {
    const canadaRemote = makeJob({
      title: "Software Engineer",
      location: "Remote - Ontario, Canada",
      department: "Engineering",
      postedAt: null,
    });
    const globalRemote = makeJob({
      title: "Software Engineer",
      location: "Remote (EMEA)",
      department: "Engineering",
      postedAt: null,
    });
    const usRemote = makeJob({
      title: "Software Engineer",
      location: "Remote, United States",
      department: "Engineering",
      postedAt: null,
    });

    expect(scoreJob(canadaRemote, DEFAULT_PREFS).score).toBeLessThan(30);
    expect(scoreJob(globalRemote, DEFAULT_PREFS).score).toBeLessThan(30);
    expect(scoreJob(usRemote, DEFAULT_PREFS).score).toBeGreaterThan(50);
  });

  it("keeps new grad and early career software roles in the feed", () => {
    const newGradJob = makeJob({
      title: "Software Engineer, New Grad",
      location: "Remote, United States",
      department: "Engineering",
      postedAt: new Date().toISOString(),
    });
    const earlyCareerJob = makeJob({
      title: "Early Career Backend Engineer",
      location: "NYC",
      department: "Engineering",
      postedAt: new Date().toISOString(),
    });

    expect(scoreJob(newGradJob, DEFAULT_PREFS).score).toBeGreaterThanOrEqual(80);
    expect(scoreJob(earlyCareerJob, DEFAULT_PREFS).score).toBeGreaterThanOrEqual(80);
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

    expect(scoreJob(freshJob, DEFAULT_PREFS).score).toBeGreaterThan(scoreJob(oldJob, DEFAULT_PREFS).score);
  });
});
