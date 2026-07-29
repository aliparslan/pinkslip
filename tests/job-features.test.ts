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

  it("reads requirements split by markup and keeps the strictest minimum", () => {
    expect(parseExperienceRequirement(
      "Engineer",
      "<li>2 years of experience</li><li>5 years building distributed systems</li>"
    )).toEqual({ min: 5, max: null });
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

  it("does not read an internship mention in the body as an entry-level requirement", () => {
    // Regression: `\bintern\b` was matched against title + description, so any
    // posting that mentioned an internship programme was scored as 0 years and
    // admitted to an early-career feed regardless of its actual level.
    expect(parseExperienceRequirement(
      "Staff Software Engineer",
      "We run a great summer internship program. This role is for experienced engineers."
    )).toEqual({ min: null, max: null });

    // The title is still authoritative for genuine internships.
    expect(parseExperienceRequirement("Software Engineering Intern", null)).toEqual({ min: 0, max: 2 });
    // And explicit new-grad language in the body still counts.
    expect(parseExperienceRequirement(
      "Software Engineer",
      "This is an entry level position open to new graduates."
    )).toEqual({ min: 0, max: 2 });
  });
});

describe("advanced degree requirement", () => {
  const listing = (title: string, description: string): JobListing => ({
    externalId: "job-1",
    title,
    url: "https://example.com/job-1",
    location: "San Francisco, CA",
    department: null,
    postedAt: null,
    description,
    salary: null,
  });

  it("flags a stated doctorate requirement", () => {
    expect(classifyJob(listing(
      "Research Scientist, Gemini",
      "PhD in Computer Science, Statistics, or a related field. Strong publication record."
    )).requires_advanced_degree).toBe(true);
    expect(classifyJob(listing(
      "Research Scientist",
      "Requirements: PhD degree in Computer Science, Machine Learning, or a related technical field."
    )).requires_advanced_degree).toBe(true);
  });

  it("does not flag a hedged or optional doctorate", () => {
    expect(classifyJob(listing(
      "Research Engineer, Pre-training",
      "Degree (BA required, MS or PhD preferred) in Computer Science or a related field."
    )).requires_advanced_degree).toBe(false);
    expect(classifyJob(listing(
      "Research Scientist, Gemini Safety",
      "PhD in Computer Science, a related field, or equivalent practical experience."
    )).requires_advanced_degree).toBe(false);
    expect(classifyJob(listing(
      "Software Engineer, Product",
      "Strong programming skills in Python. A PhD is a plus."
    )).requires_advanced_degree).toBe(false);
  });

  it("leaves ordinary postings unflagged", () => {
    expect(classifyJob(listing(
      "Backend Engineer",
      "You will build APIs. Bachelor's degree or equivalent experience."
    )).requires_advanced_degree).toBe(false);
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

  it("treats employer numeric levels four and above as senior", () => {
    expect(classifyJob(listing("Software Engineer 5")).seniority).toBe("senior");
    expect(classifyJob(listing("Data Engineer (L5) - Privacy")).seniority).toBe("senior");
    expect(classifyJob(listing("ML Engineer L4/L5, Algorithms")).seniority).toBe("senior");
    expect(classifyJob(listing("Software Engineer II")).seniority).toBe("unknown");
  });

  it("does not read 'Member of Technical Staff' as a staff-level role", () => {
    // Regression: `\bstaff\b` matched the level-less IC title used across the
    // frontier labs, discarding all 43 such postings in the historical corpus.
    expect(classifyJob(listing("Member of Technical Staff")).seniority).toBe("unknown");
    expect(classifyJob(listing("Member of Technical Staff - Ads")).seniority).toBe("unknown");
    expect(classifyJob(listing("Member of Technical Staff (KV)")).seniority).toBe("unknown");
    expect(classifyJob(listing("Technical Staff, Frontend")).seniority).toBe("unknown");

    // Genuine staff-level titles are unaffected.
    expect(classifyJob(listing("Staff Software Engineer")).seniority).toBe("staff_plus");
    expect(classifyJob(listing("Principal Engineer, Platform")).seniority).toBe("staff_plus");
    // And a senior marker still wins inside the MoTS family.
    expect(classifyJob(listing("Senior Member of Technical Staff")).seniority).toBe("senior");
  });

  it("lets an explicit early-career marker beat a generic level word", () => {
    expect(classifyJob(listing("Member of Technical Staff (Early Career)")).seniority).toBe("new_grad");
    expect(classifyJob(listing("Staff Engineer, New Grad Program")).seniority).toBe("new_grad");
    expect(classifyJob(listing("Software Engineering Intern")).seniority).toBe("internship");
  });
});
