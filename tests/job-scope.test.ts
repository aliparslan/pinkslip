import { describe, expect, it } from "bun:test";
import { isEligibleJobListing, isTargetJobTitle } from "@worker/job-scope";

describe("job ingestion scope", () => {
  it("keeps supported technical and product roles across seniority levels", () => {
    expect(isTargetJobTitle("Software Development Engineer II")).toBe(true);
    expect(isTargetJobTitle("Senior Product Manager, Growth")).toBe(true);
    expect(isTargetJobTitle("Staff Machine Learning Engineer")).toBe(true);
    expect(isTargetJobTitle("Principal Product Designer")).toBe(true);
    expect(isTargetJobTitle("Technical Program Manager, Infrastructure")).toBe(true);
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
  });

  it("uses a specific department to rescue compact technical titles", () => {
    expect(isTargetJobTitle("Engineer II", "Software Engineering")).toBe(true);
    expect(isTargetJobTitle("Engineer II", "Manufacturing")).toBe(false);
    expect(isTargetJobTitle("Designer", "Product Design")).toBe(true);
  });

  it("requires both target scope and US eligibility", () => {
    expect(isEligibleJobListing({
      title: "Backend Engineer",
      department: "Engineering",
      location: "Remote",
    })).toBe(true);
    expect(isEligibleJobListing({
      title: "Backend Engineer",
      department: "Engineering",
      location: "London",
    })).toBe(false);
    expect(isEligibleJobListing({
      title: "Recruiter",
      department: "People",
      location: "Remote",
    })).toBe(false);
  });
});
