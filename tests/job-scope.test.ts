import { describe, expect, it } from "bun:test";
import { isEligibleJobListing, isTargetJobTitle } from "@worker/job-scope";

describe("job ingestion scope", () => {
  it("keeps supported technical roles and rejects removed product roles", () => {
    expect(isTargetJobTitle("Software Development Engineer II")).toBe(true);
    expect(isTargetJobTitle("Senior Product Manager, Growth")).toBe(false);
    expect(isTargetJobTitle("Staff Machine Learning Engineer")).toBe(true);
    expect(isTargetJobTitle("Principal Product Designer")).toBe(false);
    expect(isTargetJobTitle("Technical Program Manager, Infrastructure")).toBe(false);
    expect(isTargetJobTitle("Software Engineering Intern")).toBe(true);
  });

  it("rejects people managers and executives even in technical departments", () => {
    expect(isTargetJobTitle("Engineering Manager, Platform")).toBe(false);
    expect(isTargetJobTitle("Director of Software Engineering")).toBe(false);
    expect(isTargetJobTitle("VP, Product Management")).toBe(false);
    expect(isTargetJobTitle("Head of Data Science")).toBe(false);
  });

  it("rejects clearly unsupported business and people functions", () => {
    expect(isTargetJobTitle("Senior Recruiter")).toBe(false);
    expect(isTargetJobTitle("Human Resources Representative")).toBe(false);
    expect(isTargetJobTitle("Enterprise Account Executive")).toBe(false);
    expect(isTargetJobTitle("Customer Support Engineer")).toBe(false);
    expect(isTargetJobTitle("Legal Counsel")).toBe(false);
    expect(isTargetJobTitle("Mechanical Product Engineer")).toBe(false);
    expect(isTargetJobTitle("Local Product Engineer")).toBe(false);
  });

  it("uses a specific department to rescue compact technical titles", () => {
    expect(isTargetJobTitle("Engineer II", "Software Engineering")).toBe(true);
    expect(isTargetJobTitle("Engineer II", "Manufacturing")).toBe(false);
    expect(isTargetJobTitle("Designer", "Product Design")).toBe(false);
  });

  it("requires both target scope and US eligibility", () => {
    expect(isEligibleJobListing({
      title: "Backend Engineer",
      department: "Engineering",
      location: "Remote",
      postedAt: null,
    })).toBe(true);
    expect(isEligibleJobListing({
      title: "Backend Engineer",
      department: "Engineering",
      location: "London",
      postedAt: null,
    })).toBe(false);
    expect(isEligibleJobListing({
      title: "Recruiter",
      department: "People",
      location: "Remote",
      postedAt: null,
    })).toBe(false);
  });
});
