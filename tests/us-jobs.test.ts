import { describe, expect, it } from "bun:test";
import { isUsJobLocation } from "@worker/us-jobs";

describe("isUsJobLocation", () => {
  it("accepts US cities, states, and generic remote roles", () => {
    expect(isUsJobLocation("Austin, TX")).toBe(true);
    expect(isUsJobLocation("Los Gatos")).toBe(true);
    expect(isUsJobLocation("Remote")).toBe(true);
    expect(isUsJobLocation("Remote - North America")).toBe(true);
  });

  it("accepts mixed-location jobs when a US option exists", () => {
    expect(isUsJobLocation("New York / London")).toBe(true);
    expect(isUsJobLocation("Remote - LATAM / US")).toBe(true);
  });

  it("rejects explicitly foreign and ambiguous onsite locations", () => {
    expect(isUsJobLocation("Remote - Ontario, Canada")).toBe(false);
    expect(isUsJobLocation("Remote (EMEA)")).toBe(false);
    expect(isUsJobLocation("London")).toBe(false);
    expect(isUsJobLocation("2 Locations")).toBe(false);
    expect(isUsJobLocation("")).toBe(false);
  });

  it("does not let a US-named city override an explicit foreign country", () => {
    // Regression: weaker city matching must run AFTER explicit non-US markers,
    // so a city name that also exists in the US isn't misread as a US location.
    expect(isUsJobLocation("Cambridge, United Kingdom")).toBe(false);
    expect(isUsJobLocation("Cambridge, England")).toBe(false);
    // But an explicit US state signal still wins alongside the city name.
    expect(isUsJobLocation("Cambridge, MA")).toBe(true);
  });
});
