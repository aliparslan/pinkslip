import { describe, expect, it } from "bun:test";
import { formatJobLocation } from "../frontend/src/lib/job-content";

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
