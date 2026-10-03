import { describe, expect, it } from "bun:test";
import { classifyJob, requiresAdvancedDegree } from "@worker/job-features";
import { isPotentialCatalogJobListing, isTargetJobTitle } from "@worker/job-scope";
import type { JobListing } from "@worker/adapters/types";

const listing: JobListing = {
  externalId: "test", title: "Flight Software Associate (Summer 2027)", url: "https://example.com/job",
  location: "San Francisco, CA", department: "Software Internships", postedAt: null,
  description: "This 12-week associate position is for recent graduates. Write embedded flight software in C++. A four-year degree or master's degree in computer science or electrical engineering is required.", salary: null,
};

describe("discard audit regressions", () => {
  it("admits software associates with software department evidence and assigns a matchable specialty", () => {
    expect(isPotentialCatalogJobListing(listing)).toBe(true);
    const facts = classifyJob(listing);
    expect(facts.role_family).toBe("engineering");
    expect(facts.specialties).toContain("software_engineering");
    expect(isTargetJobTitle("Software Associate", "Sales")).toBe(false);
    expect(isTargetJobTitle("Software Defined Radio Hardware Associate", "Software")).toBe(false);
  });

  it("recognizes Amazon's abbreviated software role near hardware", () => {
    const amazon = { ...listing, title: "Software Dev Engineer, Supply Chain Security, AWS Hardware Supply Chain Security", department: "Software Development" };
    expect(isPotentialCatalogJobListing(amazon)).toBe(true);
    expect(classifyJob(amazon).specialties.length).toBeGreaterThan(0);
    expect(isTargetJobTitle("Hardware Dev Engineer")).toBe(false);
  });

  it("distinguishes recruiting analytics data engineering from recruitment duties", () => {
    expect(isTargetJobTitle("Recruiting Analytics Data Engineer")).toBe(true);
    expect(isTargetJobTitle("Technical Recruiting Coordinator")).toBe(false);
    expect(isTargetJobTitle("Software Engineer Recruiter")).toBe(false);
    expect(isPotentialCatalogJobListing({ ...listing, title: "Senior Recruiting Analytics Data Engineer" })).toBe(true);
  });

  it("allows Google's quantified coding/analytics OR doctorate path", () => {
    const description = "<h2>Minimum qualifications</h2><li>Master's degree in Statistics, Computer Science or Mathematics.</li><li>3 years of work experience using analytics to solve product or business problems, coding (e.g., Python, R, SQL), querying databases or statistical analysis, or a PhD degree.</li><h2>Preferred qualifications</h2><li>5 years of work experience, or a PhD degree.</li>";
    expect(requiresAdvancedDegree(description)).toBe(false);
    expect(requiresAdvancedDegree("<h2>Minimum qualifications</h2><li>Master's degree.</li><li>3 years coding.</li><li>PhD required.</li>")).toBe(true);
    expect(requiresAdvancedDegree("<h2>Minimum qualifications</h2><li>PhD and 3 years coding required.</li>")).toBe(true);
  });

  it("does not make nice-to-haves mandatory or hide a later required section", () => {
    expect(requiresAdvancedDegree("<h2>Nice-to-Haves</h2><li>PhD in machine learning.</li>")).toBe(false);
    expect(requiresAdvancedDegree("<h2>Nice-to-Haves</h2><li>Master's degree.</li><h2>Required qualifications</h2><li>PhD in machine learning.</li>")).toBe(true);
  });
});
