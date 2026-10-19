import { describe, expect, test } from "bun:test";
import { DEFAULT_SEARCH_PROFILE, type SearchProfile } from "../shared/search-profile";
import { formatPayRange, paySpread, rangeForPlace, readRangeTitle, type PayRange } from "../shared/pay-ranges";
import { greenhousePayRanges } from "../worker/adapters/salary";
import { placesByPay, orderedPlaces, ticketRows, type FactsJob } from "../apps/native/src/features/redesign/job-facts";

const range = (patch: Partial<PayRange>): PayRange => ({ label: null, places: [], min: 100_000, max: 120_000, currency: "USD", period: "year", ...patch });

describe("a range's title", () => {
  test("names its places, a place, a zone, or nothing", () => {
    expect(readRangeTitle("Zone 1 (Menlo Park, CA; New York, NY; Bellevue, WA)"))
      .toEqual({ label: "Zone 1", places: ["Menlo Park, CA", "New York, NY", "Bellevue, WA"] });
    expect(readRangeTitle("France Annual Pay Range")).toEqual({ label: "France", places: ["France"] });
    expect(readRangeTitle("Zone 2 Pay Range")).toEqual({ label: "Zone 2", places: [] });
    expect(readRangeTitle("US Zone 3")).toEqual({ label: "US Zone 3", places: [] });
    expect(readRangeTitle("Annual Salary:")).toEqual({ label: null, places: [] });
  });

  test("Greenhouse's ranges keep every zone, in dollars", () => {
    expect(greenhousePayRanges([
      { min_cents: 16_600_000, max_cents: 19_500_000, currency_type: "USD", title: "Zone 1 (New York, NY; Menlo Park, CA)" },
      { min_cents: 14_700_000, max_cents: 17_200_000, currency_type: "USD", title: "Zone 2 (Chicago, IL)" },
    ])).toEqual([
      range({ label: "Zone 1", places: ["New York, NY", "Menlo Park, CA"], min: 166_000, max: 195_000 }),
      range({ label: "Zone 2", places: ["Chicago, IL"], min: 147_000, max: 172_000 }),
    ]);
    expect(greenhousePayRanges([])).toBeNull();
  });
});

describe("formatting and matching", () => {
  test("reads like the ticket's pay", () => {
    expect(formatPayRange(range({ min: 166_000, max: 195_000 }))).toBe("$166K–$195K");
    expect(formatPayRange(range({ min: 95_000, max: 115_000, currency: "EUR" }))).toBe("€95K–€115K");
    expect(formatPayRange(range({ min: 45, max: 60, period: "hour" }))).toBe("$45–$60/hr");
    expect(formatPayRange(range({ min: 120_000, max: 150_000, currency: "CAD" }))).toBe("CAD 120K–150K");
  });

  test("a place finds its range by city or country", () => {
    const ranges = [range({ places: ["New York, NY"], min: 1 }), range({ places: ["France"], min: 2 })];
    expect(rangeForPlace("New York City, NY", ranges)?.min).toBe(1);
    expect(rangeForPlace("Paris, France", ranges)?.min).toBe(2);
    expect(rangeForPlace("Austin, TX", ranges)).toBeNull();
  });

  test("the spread needs one currency", () => {
    expect(paySpread([range({ min: 108_000, max: 150_000 }), range({ min: 130_000, max: 176_000 })])).toBe("$108K–$176K");
    expect(paySpread([range({}), range({ currency: "EUR" })])).toBeNull();
  });
});

const job = (patch: Partial<FactsJob>): FactsJob => ({
  title: "Software Engineer", location: "New York, NY; Chicago, IL; Seattle, WA", salary: "$166,000 - $195,000",
  posted_at: "2026-10-09T12:00:00Z", first_seen_at: "2026-10-09T12:05:00Z", ...patch,
});
const profile: SearchProfile = { ...DEFAULT_SEARCH_PROFILE, location_ids: ["chicago"] };
const zoned = [
  range({ label: "Zone 1", places: ["New York, NY", "Seattle, WA"], min: 166_000, max: 195_000 }),
  range({ label: "Zone 2", places: ["Chicago, IL"], min: 147_000, max: 172_000 }),
];

describe("pay by place on the job page", () => {
  test("the ticket shows the pay for its place, your search's first", () => {
    const pay = (target: FactsJob, search?: SearchProfile) => ticketRows(target, search)[2]![0]!.value;
    expect(pay(job({ pay_ranges: zoned }), profile)).toBe("$147K–$172K");
    expect(pay(job({ pay_ranges: zoned }))).toBe("$166K–$195K");
    // Zones with no places: the whole spread.
    expect(pay(job({ pay_ranges: [range({ label: "Zone 1", min: 128_000, max: 176_000 }), range({ label: "Zone 2", min: 108_800, max: 149_600 })] }))).toBe("$109K–$176K");
    // No ranges: the salary as before.
    expect(pay(job({}))).toBe("$166K–$195K");
  });

  test("the sheet groups places under their pay, or lists the zones", () => {
    const places = orderedPlaces(job({}), profile);
    expect(placesByPay(job({ pay_ranges: zoned }), places)).toEqual({
      groups: [
        { pay: "$147K–$172K", places: [{ place: "Chicago, IL", matched: true }] },
        { pay: "$166K–$195K", places: [{ place: "New York, NY", matched: false }, { place: "Seattle, WA", matched: false }] },
      ],
      zones: [],
    });
    const zonesOnly = placesByPay(job({ pay_ranges: [range({ label: "Zone 1" }), range({ label: "Zone 2", min: 90_000 })] }), places);
    expect(zonesOnly.groups).toEqual([{ pay: null, places }]);
    expect(zonesOnly.zones).toEqual([{ label: "Zone 1", pay: "$100K–$120K" }, { label: "Zone 2", pay: "$90K–$120K" }]);
  });
});
