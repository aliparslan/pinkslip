import { describe, expect, it } from "bun:test";
import { formatRowLocation, formatRowSalary, jobLocationParts, jobPayBands } from "../packages/core/src/job-format";
import { compactJobAge } from "../packages/core/src/job-timing";

describe("formatRowLocation", () => {
  it("drops the state for well-known cities", () => {
    expect(formatRowLocation("New York, NY")).toBe("New York");
    expect(formatRowLocation("San Francisco, California, United States")).toBe("San Francisco");
    expect(formatRowLocation("Austin, TX | Denver, CO | Atlanta, GA")).toBe("Austin +2");
    expect(formatRowLocation("Austin, TX | Denver, CO")).toBe("Austin + Denver");
  });

  it("keeps the state elsewhere and leaves remote alone", () => {
    expect(formatRowLocation("Pittsburgh, PA")).toBe("Pittsburgh, PA");
    expect(formatRowLocation("Washington, DC")).toBe("Washington, DC");
    expect(formatRowLocation("Remote - US")).toBe("Remote");
    expect(formatRowLocation("New York, NY, US / Remote (US)")).toBe("Remote +1");
    expect(formatRowLocation(null)).toBeNull();
  });
});

describe("formatRowSalary", () => {
  it("writes the unit once for a range", () => {
    expect(formatRowSalary("$160,000 - $190,000")).toBe("$160–190K");
    expect(formatRowSalary("$155K - $185K")).toBe("$155–185K");
    expect(formatRowSalary("120K to 150K")).toBe("120–150K");
  });

  it("leaves other amounts as they are", () => {
    expect(formatRowSalary("$150,000")).toBe("$150K");
    expect(formatRowSalary("Offers Equity")).toBeNull();
  });
});

describe("compactJobAge", () => {
  const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();
  it("shortens the age to a unit", () => {
    expect(compactJobAge({ posted_at: ago(4), first_seen_at: ago(3) })).toBe("4m");
    expect(compactJobAge({ posted_at: null, first_seen_at: ago(180) })).toBe("3h");
    expect(compactJobAge({ posted_at: ago(0), first_seen_at: ago(0) })).toBe("now");
    expect(compactJobAge({ posted_at: null, first_seen_at: null })).toBeNull();
  });
});

describe("jobLocationParts", () => {
  it("lists every place once, cleaned", () => {
    expect(jobLocationParts("Seattle, WA | San Francisco, CA | New York, NY | Remote (US)")).toEqual([
      "Seattle, WA",
      "San Francisco, CA",
      "New York, NY",
      "Remote",
    ]);
    expect(jobLocationParts("New York, NY; New York, NY")).toEqual(["New York, NY"]);
    expect(jobLocationParts(null)).toEqual([]);
  });
});

describe("jobPayBands", () => {
  it("splits named bands", () => {
    expect(jobPayBands("San Francisco or New York: $165,000 - $200,000 | Seattle: $155,000 - $190,000 | Remote: $140,000 - $170,000")).toEqual([
      { region: "San Francisco or New York", amount: "$165–200K" },
      { region: "Seattle", amount: "$155–190K" },
      { region: "Remote", amount: "$140–170K" },
    ]);
  });

  it("keeps a single band and hourly pay", () => {
    expect(jobPayBands("$160,000 - $190,000")).toEqual([{ region: null, amount: "$160–190K" }]);
    expect(jobPayBands("$95/hr")).toEqual([{ region: null, amount: "$95/hr" }]);
    expect(jobPayBands("Offers Equity")).toEqual([]);
  });
});
