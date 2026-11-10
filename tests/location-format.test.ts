import { describe, expect, it } from "bun:test";
import { formatJobLocation } from "../packages/core/src/job-format";
import { isDuplicateLeadingJobHeading } from "../apps/webapp/src/features/jobs/job-content";

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

  it("leads with a US place, the rest in the posting's order", () => {
    expect(formatJobLocation("Canada - Remote; Germany - Remote; United Kingdom - Remote; United States - Remote")).toBe("United States - Remote +3");
    expect(formatJobLocation("Toronto, ON, CA / Austin, TX")).toBe("Austin, TX + Toronto, ON, CA");
    expect(formatJobLocation("London, UK; Dublin, Ireland; Berlin, Germany")).toBe("London, UK +2");
  });

  it("keeps two short locations readable", () => {
    expect(formatJobLocation("Chicago, IL; Boston, MA")).toBe("Chicago, IL + Boston, MA");
  });

  it("passes through empty locations", () => {
    expect(formatJobLocation(null)).toBeNull();
    expect(formatJobLocation("  ")).toBeNull();
    // A board with no place to give writes one of these (seen in search, Nov 9: "Stripe · N/A").
    expect(formatJobLocation("N/A")).toBeNull();
    expect(formatJobLocation("n/a | Seattle, WA")).toBe("Seattle, WA");
    expect(formatJobLocation("TBD")).toBeNull();
    expect(formatJobLocation("Remote - NA")).toBe("Remote - NA");
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

describe("formatJobLocation with feed quirks", () => {
  it("puts country-first locations in city, state order", () => {
    expect(formatJobLocation("US, WA, Seattle")).toBe("Seattle, WA");
  });

  it("title-cases shouting city names but keeps short codes", () => {
    expect(formatJobLocation("US, WA, BELLEVUE")).toBe("Bellevue, WA");
    expect(formatJobLocation("SAN FRANCISCO, CA")).toBe("San Francisco, CA");
    expect(formatJobLocation("NYC")).toBe("NYC");
  });
});
