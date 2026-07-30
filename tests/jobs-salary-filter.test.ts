import { describe, expect, it } from "bun:test";
import { parseSalaryRange } from "@worker/routes/jobs";

describe("parseSalaryRange", () => {
  it("parses dollar-prefixed ranges as stored by every ATS adapter", () => {
    expect(parseSalaryRange("$150,000 – $210,000 (Base salary)")).toEqual({ min: 150000, max: 210000 });
    expect(parseSalaryRange("$100K-$120K")).toEqual({ min: 100000, max: 120000 });
    expect(parseSalaryRange("$180K-$220K USD")).toEqual({ min: 180000, max: 220000 });
    expect(parseSalaryRange("$150k - $200k")).toEqual({ min: 150000, max: 200000 });
  });

  it("excludes hourly rates", () => {
    expect(parseSalaryRange("$65/hr")).toBeNull();
  });

  it("returns null with no salary", () => {
    expect(parseSalaryRange(null)).toBeNull();
  });
});
