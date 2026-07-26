import { describe, it, expect } from "bun:test";
import { classifyJob, parseExperienceRequirement } from "@worker/job-features";
import type { JobListing } from "@worker/adapters/types";

describe("parseExperienceRequirement", () => {
  it("reads an explicit range", () => {
    expect(parseExperienceRequirement("Engineer", "We want 3-5 years of work")).toEqual({
      min: 3,
      max: 5,
    });
  });

  it("reads a qualified minimum", () => {
    expect(parseExperienceRequirement("Engineer", "Minimum of 4 years required")).toEqual({
      min: 4,
      max: null,
    });
    expect(parseExperienceRequirement("Engineer", "5+ years building systems")).toEqual({
      min: 5,
      max: null,
    });
    expect(parseExperienceRequirement("Engineer", "6 years of professional experience")).toEqual({
      min: 6,
      max: null,
    });
  });

  it("does NOT treat a stray 'N years' phrase as a requirement", () => {
    // Regression: the old regex grabbed the first bare "N years" anywhere, so
    // marketing copy produced bogus experience requirements.
    expect(parseExperienceRequirement("Engineer", "We were founded 3 years ago")).toEqual({
      min: null,
      max: null,
    });
    expect(parseExperienceRequirement("Engineer", "Enjoy 10 years of free snacks")).toEqual({
      min: null,
      max: null,
    });
    expect(parseExperienceRequirement("Engineer", "Our team shipped for 7 years and counting")).toEqual({
      min: null,
      max: null,
    });
  });

  it("still recognizes early-career roles", () => {
    expect(parseExperienceRequirement("New Grad Engineer", null)).toEqual({ min: 0, max: 2 });
  });
});

describe("classifyJob", () => {
  const listing = (title: string, description: string | null = null): JobListing => ({
    externalId: "job-1",
    title,
    url: "https://example.com/job-1",
    location: "Remote - US",
    department: "Program Management",
    postedAt: null,
    description,
    salary: null,
  });

  it("treats removed program-management titles as management", () => {
    expect(classifyJob(listing("Technical Program Manager")).seniority).toBe("manager");
    expect(classifyJob(listing("Technical Program Manager", "2+ years of experience"))).toMatchObject({
      seniority: "manager",
      min_years: 2,
    });
  });

  it("still classifies engineering managers as managers", () => {
    expect(classifyJob(listing("Engineering Manager")).seniority).toBe("manager");
  });
});
