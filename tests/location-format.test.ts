import { describe, expect, it } from "bun:test";
import {
  formatJobLocation,
  isDuplicateLeadingJobHeading,
} from "../packages/client/src/lib/job-content";

describe("formatJobLocation", () => {
  it("removes repeated country detail", () => {
    expect(formatJobLocation("San Francisco, California, United States")).toBe("San Francisco, CA");
    expect(formatJobLocation("New York, New York")).toBe("New York, NY");
    expect(formatJobLocation("Remote - US")).toBe("Remote");
  });

  it("summarizes remote and multi-location listings", () => {
    expect(formatJobLocation("New York, NY, US / Remote (US)")).toBe("Remote +1");
    expect(formatJobLocation("Austin, TX | Denver, CO | Atlanta, GA")).toBe("Austin, TX +2");
    expect(formatJobLocation("Remote-Friendly (Travel-Required) | New York, NY")).toBe("Remote-friendly (travel) +1");
  });

  it("keeps two short locations readable", () => {
    expect(formatJobLocation("Chicago, IL; Boston, MA")).toBe("Chicago, IL + Boston, MA");
  });

  it("passes through empty locations", () => {
    expect(formatJobLocation(null)).toBeNull();
    expect(formatJobLocation("  ")).toBeNull();
  });
});

describe("isDuplicateLeadingJobHeading", () => {
  it("recognizes headings already supplied by the detail page", () => {
    expect(isDuplicateLeadingJobHeading("About the Role")).toBe(true);
    expect(isDuplicateLeadingJobHeading("Job Description")).toBe(true);
  });

  it("recognizes a repeated job title or company name", () => {
    const context = { title: "Software Engineer", companyName: "Acme" };
    expect(isDuplicateLeadingJobHeading("Software Engineer", context)).toBe(true);
    expect(isDuplicateLeadingJobHeading("Software Engineer at Acme", context)).toBe(true);
    expect(isDuplicateLeadingJobHeading("Acme", context)).toBe(true);
  });

  it("preserves useful section headings", () => {
    const context = { title: "Software Engineer", companyName: "Acme" };
    expect(isDuplicateLeadingJobHeading("Responsibilities", context)).toBe(false);
    expect(isDuplicateLeadingJobHeading("Qualifications", context)).toBe(false);
  });
});
