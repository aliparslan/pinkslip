import { describe, expect, it } from "bun:test";
import { isUnreadableLocation, isUsJobLocation, ruledUsLocation } from "@worker/us-jobs";

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

  it("reads a city, region and country code by its country, even one that looks like a state", () => {
    expect(isUsJobLocation("Bengaluru, KA, IN")).toBe(false);
    expect(isUsJobLocation("Bengaluru, KA, IN / Bengaluru, Karnataka, IN")).toBe(false);
    expect(isUsJobLocation("Toronto, ON, CA")).toBe(false);
    expect(isUsJobLocation("Berlin, BE, DE")).toBe(false);
    expect(isUsJobLocation("Indianapolis, IN, US")).toBe(true);
    expect(isUsJobLocation("San Francisco, CA, US")).toBe(true);
    expect(isUsJobLocation("Bengaluru, KA, IN / Austin, TX")).toBe(true);
    expect(isUsJobLocation("Brooklyn, New York, NY")).toBe(true);
    expect(isUsJobLocation("Austin, TX, 78701")).toBe(true);
    // Two parts stay a city and a state.
    expect(isUsJobLocation("Indianapolis, IN")).toBe(true);
    expect(isUsJobLocation("San Francisco, CA")).toBe(true);
  });

  it("does not let a US-named city override an explicit foreign country", () => {
    // Weak city matching only accepts the entire location, so a city name that
    // also exists in the US cannot rescue a foreign-qualified location.
    expect(isUsJobLocation("Cambridge, United Kingdom")).toBe(false);
    expect(isUsJobLocation("Cambridge, England")).toBe(false);
    // But an explicit US state signal still wins alongside the city name.
    expect(isUsJobLocation("Cambridge, MA")).toBe(true);
  });
  it("reads a country code written first, where the code is also a US state", () => {
    expect(isUsJobLocation("IN-Pune")).toBe(false);
    expect(isUsJobLocation("IN-Bangalore-MSO")).toBe(false);
    expect(isUsJobLocation("CA-Ontario-Toronto")).toBe(false);
    expect(isUsJobLocation("CA-British Columbia-Remote")).toBe(false);
    expect(isUsJobLocation("DE-Berlin-Trion Building")).toBe(false);
    expect(isUsJobLocation("IL-Israel-Remote")).toBe(false);
    expect(isUsJobLocation("CO-Colombia-Remote")).toBe(false);
    expect(isUsJobLocation("CA-San Francisco")).toBe(true);
    expect(isUsJobLocation("US-CA-Menlo Park")).toBe(true);
    expect(isUsJobLocation("US-IL-Remote")).toBe(true);
  });

  it("splits places joined by a bullet or a word", () => {
    expect(isUsJobLocation("San Francisco, CA \u2022 New York, NY")).toBe(true);
    expect(isUsJobLocation("Devens, MA & Richmond, VA")).toBe(true);
    expect(isUsJobLocation("San Francisco, CA or New York, NY")).toBe(true);
    expect(isUsJobLocation("Bengaluru, KA, IN \u2022 Toronto, ON, CA")).toBe(false);
  });

  it("doesn't let plain Remote rescue a foreign place joined by a word", () => {
    expect(isUsJobLocation("Toronto or Remote")).toBe(false);
    expect(isUsJobLocation("San Francisco Bay Area or Remote")).toBe(true);
  });

  it("reads the place after a work-mode prefix", () => {
    expect(isUsJobLocation("Hybrid - San Francisco")).toBe(true);
    expect(isUsJobLocation("Hub - Seattle")).toBe(true);
    expect(isUsJobLocation("Remote - Dallas")).toBe(true);
    expect(isUsJobLocation("Remote - Global")).toBe(false);
    expect(isUsJobLocation("Hub - Porto")).toBe(false);
    expect(isUsJobLocation("Remote - CA")).toBe(false);
    expect(isUsJobLocation("Hybrid")).toBe(false);
  });

  it("tells a location no filter can read from one that names a place", () => {
    for (const location of ["Hybrid", "In-Office", "On-site", "Americas", "North America", "Remote, AMER", "Remote - Americas ", "Remote, Global", "Global", "Anywhere"]) {
      expect(isUnreadableLocation(location)).toBe(true);
    }
    for (const location of ["Remote", "Remote - US", "London, UK", "Remote - EU - LATAM - NA", "North America, South America", "Hybrid - Toronto", ""]) {
      expect(isUnreadableLocation(location)).toBe(false);
    }
  });

  it("writes a ruled location so the filters and the feed can read it", () => {
    expect(ruledUsLocation("Hybrid")).toBe("Hybrid, United States");
    expect(ruledUsLocation("In-Office")).toBe("On-site, United States");
    expect(ruledUsLocation("Remote, AMER")).toBe("Remote, United States");
    expect(ruledUsLocation("Americas")).toBe("United States");
    for (const location of ["Hybrid", "In-Office", "Remote, AMER", "Americas"]) {
      expect(isUsJobLocation(ruledUsLocation(location))).toBe(true);
    }
  });

  it("accepts a US city with an office or work-mode note", () => {
    expect(isUsJobLocation("San Francisco Office")).toBe(true);
    expect(isUsJobLocation("San Francisco (Remote)")).toBe(true);
    expect(isUsJobLocation("Cambridge, UK")).toBe(false);
  });
});
