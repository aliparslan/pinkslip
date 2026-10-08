import { describe, expect, it } from "bun:test";
import { formatRowLocation, formatRowSalary } from "../packages/core/src/job-format";
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
