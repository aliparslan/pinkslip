import { describe, expect, it } from "bun:test";
import { defaultCompanyPollTier, getAdapter } from "@worker/ats";
import {
  COMPANY_SOURCE_PRESENTATION,
  COMPANY_SOURCE_TYPES,
  POLLABLE_COMPANY_SOURCE_TYPES,
  companyCareersUrl,
  isCompanySourceType,
} from "../shared/company-sources";

describe("company source registry", () => {
  it("keeps every pollable source connected to an adapter", () => {
    for (const source of POLLABLE_COMPANY_SOURCE_TYPES) {
      expect(getAdapter(source)?.name).toBe(source);
    }
    expect(getAdapter("custom")).toBeNull();
  });

  it("keeps source metadata complete and unique", () => {
    expect(new Set(COMPANY_SOURCE_TYPES).size).toBe(COMPANY_SOURCE_TYPES.length);
    expect(Object.keys(COMPANY_SOURCE_PRESENTATION).sort())
      .toEqual([...COMPANY_SOURCE_TYPES].sort());
    for (const source of COMPANY_SOURCE_TYPES) {
      expect(isCompanySourceType(source)).toBe(true);
    }
  });

  it("provides stable public careers URLs for custom company adapters", () => {
    expect(companyCareersUrl("amazon", "amazon"))
      .toBe("https://www.amazon.jobs/en/search?country=USA");
    expect(companyCareersUrl("apple", "apple"))
      .toBe("https://jobs.apple.com/en-us/search");
    expect(companyCareersUrl("google", "google"))
      .toBe("https://www.google.com/about/careers/applications/jobs/results/?company=Google&location=United%20States");
    expect(companyCareersUrl("meta", "meta"))
      .toBe("https://www.metacareers.com/jobsearch/");
    expect(companyCareersUrl("uber", "uber"))
      .toBe("https://jobs.uber.com/en/jobs/");
    expect(companyCareersUrl("tesla", "tesla"))
      .toBe("https://www.tesla.com/careers/search/");
    expect(companyCareersUrl("bloomberg", "bloomberg"))
      .toBe("https://bloomberg.avature.net/careers/SearchJobs/");
    expect(companyCareersUrl(
      "eightfold",
      "https://paypal.eightfold.ai/careers?domain=paypal.com"
    )).toBe("https://paypal.eightfold.ai/careers?domain=paypal.com");
    expect(defaultCompanyPollTier("amazon")).toBe(2);
    expect(defaultCompanyPollTier("apple")).toBe(1);
    expect(defaultCompanyPollTier("google")).toBe(1);
    expect(defaultCompanyPollTier("meta")).toBe(1);
    expect(defaultCompanyPollTier("uber")).toBe(1);
    expect(defaultCompanyPollTier("tesla")).toBe(2);
    expect(defaultCompanyPollTier("bloomberg")).toBe(2);
    expect(defaultCompanyPollTier("eightfold")).toBe(2);
  });
});
