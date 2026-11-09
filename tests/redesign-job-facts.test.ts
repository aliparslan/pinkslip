import { describe, expect, test } from "bun:test";
import { DEFAULT_SEARCH_PROFILE, type SearchProfile } from "../shared/search-profile";
import {
  arrivedAtTop,
  appliedLabel, applyButtonState, feedSections, plainText, sectionCount, fitsYourSearch, jobExperience, jobLevel, rowFacts, rowLevel, ticketRows, ticketStub, type FactsJob,
} from "../apps/native/src/features/redesign/job-facts";

const job = (patch: Partial<FactsJob> = {}): FactsJob => ({
  title: "Software Engineer",
  location: "New York, NY",
  salary: "$145,000 - $175,000",
  posted_at: "2026-10-09T12:00:00Z",
  first_seen_at: "2026-10-09T12:05:00Z",
  ...patch,
});

const profile: SearchProfile = {
  ...DEFAULT_SEARCH_PROFILE,
  roles: ["software_engineering"],
  target_levels: ["new_grad", "early_career"],
  location_ids: ["new_york"],
  work_modes: ["remote", "onsite"],
};

describe("level and experience", () => {
  test("reads the stage and stated years from the match fact", () => {
    expect(jobLevel(job({ match_fact: "New-grad role" }))).toBe("New grad");
    expect(jobLevel(job({ match_fact: "Asks for 2+ years" }))).toBe("Early career");
    expect(jobLevel(job({ match_fact: "Asks for 4+ years" }))).toBe("Mid-career");
    expect(jobLevel(job({ match_fact: "Experience not specified" }))).toBeNull();
    expect(jobExperience(job({ match_fact: "Asks for 2+ years" }))).toBe("2+ years");
    expect(jobExperience(job({ match_fact: "New-grad role" }))).toBeNull();
  });

  test("rows leave the level out when the title already says it", () => {
    expect(rowLevel(job({ title: "Software Engineer, New Grad", match_fact: "New-grad role" }))).toBeNull();
    expect(rowLevel(job({ title: "Software Engineer Intern", match_fact: "Internship" }))).toBeNull();
    expect(rowLevel(job({ match_fact: "New-grad role" }))).toBe("New grad");
    expect(rowLevel(job({ match_fact: "Early-career role" }))).toBe("1–3 yrs");
    expect(rowLevel(job({ match_fact: "Asks for 3+ years" }))).toBe("3+ yrs");
  });

  test("a row's line two is level, place, pay", () => {
    expect(rowFacts(job({ match_fact: "Early-career role" }))).toBe("1–3 yrs · New York · $145–175K");
    expect(rowFacts(job({ salary: "$147000 - $210000" }))).toBe("New York · $147–210K");
  });

  test("a search for one level leaves that level out of the row", () => {
    const newGrad = job({ match_fact: "New-grad role" });
    expect(rowFacts(newGrad)).toBe("New grad · New York · $145–175K");
    expect(rowFacts(newGrad, "new_grad")).toBe("New York · $145–175K");
    // A row of another level still says it.
    expect(rowFacts(job({ match_fact: "Early-career role" }), "new_grad")).toBe("1–3 yrs · New York · $145–175K");
  });
});

describe("the ticket", () => {
  test("keeps the same grid and says Not listed for missing facts", () => {
    const rows = ticketRows(job({ salary: null, sponsorship_available: null }));
    expect(rows.map((row) => row.map((fact) => fact.label))).toEqual([["Level", "Experience"], ["Location"], ["Pay", "Visa sponsorship"]]);
    expect(rows[2][0].value).toBe("Not listed");
    expect(rows[2][1].value).toBe("Not listed");
  });

  test("leads with the place the search covers and summarizes the rest", () => {
    const rows = ticketRows(job({ location: "San Francisco, CA; Seattle, WA; Austin, TX; Denver, CO; New York, NY" }), profile);
    expect(rows[1][0]).toMatchObject({ label: "Locations", value: "New York, NY", matched: true, detail: "San Francisco, CA, Seattle, WA and 2 more" });
  });

  test("the stub says Updated for Greenhouse and names the source", () => {
    expect(ticketStub(job({ source_type: "greenhouse" }))).toMatch(/^Updated Oct \d+ · via Greenhouse$/);
    expect(ticketStub(job({ source_type: "custom" }))).toMatch(/^Posted Oct \d+$/);
  });

  test("the applied label carries the date when known", () => {
    expect(appliedLabel(job({ applied_at: "2026-10-10T15:00:00Z" }))).toMatch(/^Applied Oct \d+$/);
    expect(appliedLabel(job())).toBe("Applied");
  });
});

describe("plain text", () => {
  test("decodes the entities some feeds send", () => {
    expect(plainText("Senior Software Engineer, K&amp;I")).toBe("Senior Software Engineer, K&I");
    expect(plainText("AT&amp;T ")).toBe("AT&T");
  });
});

describe("fits your search", () => {
  test("names the stage, place and role the profile asked for", () => {
    expect(fitsYourSearch(job({ match_fact: "New-grad role", specialties: ["software_engineering"] }), profile))
      .toEqual(["new grad", "NYC", "SWE"]);
    expect(fitsYourSearch(job({ location: "Mountain View, CA" }), { ...profile, location_ids: ["sf_bay"] })).toEqual(["SF Bay Area"]);
    expect(fitsYourSearch(job({ location: "Remote - USA" }), profile)).toEqual(["remote"]);
    expect(fitsYourSearch(job(), undefined)).toEqual([]);
  });
});

describe("feed sections", () => {
  test("splits by local day and drops empty sections", () => {
    const now = new Date(2026, 9, 12, 15, 0);
    const today = job({ posted_at: new Date(2026, 9, 12, 9, 0).toISOString() });
    const tuesday = job({ posted_at: new Date(2026, 9, 7, 9, 0).toISOString() });
    const old = job({ posted_at: new Date(2026, 8, 20, 9, 0).toISOString() });
    expect(feedSections([today, tuesday, old], now).map((section) => [section.title, section.jobs.length]))
      .toEqual([["New today", 1], ["Earlier this week", 1], ["Older", 1]]);
    expect(feedSections([tuesday], now).map((section) => section.title)).toEqual(["Earlier this week"]);
  });

  test("every section is counted, the last one from what the feed matched", () => {
    const now = new Date(2026, 9, 12, 15, 0);
    const today = job({ posted_at: new Date(2026, 9, 12, 9, 0).toISOString() });
    const tuesday = job({ posted_at: new Date(2026, 9, 7, 9, 0).toISOString() });
    const old = job({ posted_at: new Date(2026, 8, 20, 9, 0).toISOString() });
    const sections = feedSections([today, tuesday, tuesday, old], now);
    // All loaded: each counts what it holds.
    expect(sections.map((_, index) => sectionCount(sections, index, false, undefined))).toEqual([1, 2, 1]);
    // More to load: the last is the feed's total less the sections above.
    expect(sectionCount(sections, 2, true, 40)).toBe(37);
    expect(sectionCount(sections, 0, true, 40)).toBe(1);
    // An older Worker sends no total: no count rather than a wrong one.
    expect(sectionCount(sections, 2, true, undefined)).toBeUndefined();
    // Only New today loaded so far: how many so far, never the whole feed.
    const onlyToday = [{ title: "New today", jobs: [job(), job()] }];
    expect(sectionCount(onlyToday, 0, true, 2597)).toBe("2+");
    expect(sectionCount(onlyToday, 0, false, 2597)).toBe(2);
    expect(sectionCount([{ title: "Earlier this week", jobs: [job()] }], 0, true, 2597)).toBe("1+");
    // Never fewer than the rows already on screen.
    expect(sectionCount(sections, 2, true, 2)).toBe(1);
  });
});

describe("the Apply button's state", () => {
  test("Apply until you apply, Applied with its day, then the stage it reached", () => {
    const base = { title: "Software Engineer", location: "Remote", salary: null, posted_at: null, first_seen_at: "2026-10-01T00:00:00Z" };
    expect(applyButtonState(base, false, true)).toEqual({ kind: "apply", closed: true });
    expect(applyButtonState({ ...base, applied_at: "2026-10-14T15:00:00", application_stage: "applied" }, true, false)).toEqual({ kind: "applied", date: "Oct 14" });
    expect(applyButtonState({ ...base, application_stage: "interview" }, true, false)).toEqual({ kind: "stage", stage: "interview", label: "Interviewing" });
  });
});

describe("arrivedAtTop", () => {
  test("counts postings new at the top of an unchanged list", () => {
    expect(arrivedAtTop(["a", "b", "c"], ["x", "y", "a", "b", "c"])).toBe(2);
  });
  test("allows what they pushed off the end of the last page", () => {
    expect(arrivedAtTop(["a", "b", "c"], ["x", "a", "b"])).toBe(1);
  });
  test("is zero for a first load, no change or a reshuffle", () => {
    expect(arrivedAtTop([], ["x", "a"])).toBe(0);
    expect(arrivedAtTop(["a", "b"], ["a", "b"])).toBe(0);
    expect(arrivedAtTop(["a", "b"], ["x", "b", "a"])).toBe(0);
    expect(arrivedAtTop(["a", "b"], ["x", "y"])).toBe(0);
  });
  test("is zero when something new lands below the top", () => {
    expect(arrivedAtTop(["a", "b"], ["a", "x", "b"])).toBe(0);
    expect(arrivedAtTop(["a", "b"], ["x", "a", "y", "b"])).toBe(0);
  });
});
