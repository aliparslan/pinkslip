import { describe, expect, test } from "bun:test";
import { DEFAULT_SEARCH_PROFILE, type SearchProfile } from "../shared/search-profile";
import {
  changedRows, changedSentence, citiesSummary, experienceSummary, rolesSummary, stageSummary, toggled, whereSummary, withRemote,
} from "../apps/native/src/features/redesign/search-draft";

const profile = (patch: Partial<SearchProfile> = {}): SearchProfile => ({ ...DEFAULT_SEARCH_PROFILE, ...patch });

describe("Edit search summaries", () => {
  test("career stages shorten to fit a menu row, and every stage is Any", () => {
    expect(stageSummary(profile({ target_levels: ["new_grad"] }))).toBe("New grad");
    expect(stageSummary(profile({ target_levels: ["new_grad", "early_career"] }))).toBe("New grad +1");
    expect(stageSummary(profile({ target_levels: ["internship", "new_grad", "mid_career"] }))).toBe("New grad +2");
    expect(stageSummary(profile({ target_levels: ["internship", "new_grad", "early_career", "mid_career"] }))).toBe("Any");
  });

  test("cities use short names, or Anywhere", () => {
    expect(citiesSummary(profile({ location_ids: ["new_york", "sf_bay"], relocation_willing: false }))).toBe("NYC, SF Bay Area");
    expect(citiesSummary(profile({ location_ids: [], relocation_willing: false }))).toBe("Anywhere");
  });

  test("experience reads as a ceiling", () => {
    expect(experienceSummary(profile({ max_required_years: null }))).toBe("Up to my experience");
    expect(experienceSummary(profile({ max_required_years: 0 }))).toBe("None");
    expect(experienceSummary(profile({ max_required_years: 1 }))).toBe("Up to 1 year");
    expect(experienceSummary(profile({ max_required_years: 3 }))).toBe("Up to 3 years");
  });

  test("roles name the chosen ones", () => {
    expect(rolesSummary(profile({ roles: ["software_engineering"], primary_role: "software_engineering" }))).toBe("SWE");
  });
});

describe("the search menu", () => {
  test("where joins remote and the cities", () => {
    expect(whereSummary(profile({ work_modes: ["remote"], location_ids: ["new_york"], relocation_willing: false }))).toBe("Remote (US)");
    expect(whereSummary(profile({ work_modes: ["remote", "onsite"], location_ids: ["new_york", "sf_bay"], relocation_willing: false }))).toBe("Remote (US), NYC +1");
    expect(whereSummary(profile({ work_modes: ["onsite", "hybrid"], location_ids: ["new_york"], relocation_willing: false }))).toBe("NYC");
    expect(whereSummary(profile({ work_modes: ["onsite"], location_ids: [], relocation_willing: false }))).toBe("Anywhere in the US");
  });

  test("a list never empties", () => {
    expect(toggled(["a"], "a")).toBeNull();
    expect(toggled(["a"], "b")).toEqual(["a", "b"]);
  });
});

describe("Remote", () => {
  test("turning it off keeps at least one way of working", () => {
    expect(withRemote(profile({ work_modes: ["remote"] }), false)).toEqual({ work_modes: ["onsite", "hybrid"] });
    expect(withRemote(profile({ work_modes: ["remote", "hybrid"] }), false)).toEqual({ work_modes: ["hybrid"] });
    expect(withRemote(profile({ work_modes: ["onsite"] }), true)).toEqual({ work_modes: ["remote", "onsite"] });
  });
});

describe("Save your changes", () => {
  test("names the rows that changed, in menu order", () => {
    const saved = profile({ location_ids: ["new_york"], relocation_willing: false });
    const draft = { ...saved, max_required_years: 2, location_ids: ["new_york", "sf_bay"] as SearchProfile["location_ids"] };
    expect(changedRows(saved, draft)).toEqual(["Where", "Experience asked"]);
    expect(changedSentence(changedRows(saved, draft))).toBe("Where and Experience asked changed.");
  });

  test("order alone isn't a change", () => {
    const saved = profile({ location_ids: ["new_york", "sf_bay"], relocation_willing: false });
    expect(changedRows(saved, { ...saved, location_ids: ["sf_bay", "new_york"] })).toEqual([]);
  });

  test("one row, three rows", () => {
    expect(changedSentence(["Roles"])).toBe("Roles changed.");
    expect(changedSentence(["Career stage", "Roles", "Where"])).toBe("Career stage, Roles and Where changed.");
  });
});
