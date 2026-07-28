import { describe, expect, it } from "bun:test";
import { isUsJobLocation } from "@worker/us-jobs";

describe("isUsJobLocation", () => {
  it("accepts US cities, states, and generic remote roles", () => {
    expect(isUsJobLocation("Austin, TX")).toBe(true);
    expect(isUsJobLocation("Los Gatos")).toBe(true);
    expect(isUsJobLocation("Remote")).toBe(true);
    expect(isUsJobLocation("Greater Boston Area")).toBe(true);
    expect(isUsJobLocation("")).toBe(true);
    expect(isUsJobLocation("Unknown")).toBe(true);
  });

  it("accepts mixed-location jobs when a US option exists", () => {
    expect(isUsJobLocation("New York / London")).toBe(true);
    expect(isUsJobLocation("Remote - LATAM / US")).toBe(true);
  });

  it("rejects explicitly foreign and ambiguous onsite locations", () => {
    expect(isUsJobLocation("Remote - Ontario, Canada")).toBe(false);
    expect(isUsJobLocation("Remote (EMEA)")).toBe(false);
    expect(isUsJobLocation("Remote - North America")).toBe(false);
    expect(isUsJobLocation("Vietnam, Remote")).toBe(false);
    expect(isUsJobLocation("Asia Pacific, Remote")).toBe(false);
    expect(isUsJobLocation("Bengaluru, India")).toBe(false);
    expect(isUsJobLocation("London")).toBe(false);
    expect(isUsJobLocation("2 Locations")).toBe(false);
  });

  it("does not let a US-named city override an explicit foreign country", () => {
    // Weak city matching only accepts the entire location, so a city name that
    // also exists in the US cannot rescue a foreign-qualified location.
    expect(isUsJobLocation("Cambridge, United Kingdom")).toBe(false);
    expect(isUsJobLocation("Cambridge, England")).toBe(false);
    // But an explicit US state signal still wins alongside the city name.
    expect(isUsJobLocation("Cambridge, MA")).toBe(true);
  });
});
