import { describe, expect, test } from "bun:test";
import { DEFAULT_SEARCH_PROFILE, type SearchProfile } from "../shared/search-profile";
import {
  appliedLabel, applyButtonState, feedSections, plainText, fitsYourSearch, jobExperience, jobLevel, rowFacts, rowLevel, ticketRows, ticketStub, type FactsJob,
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
});

describe("the ticket", () => {
  test("keeps the same grid and says Not listed for missing facts", () => {
    const rows = ticketRows(job({ salary: null, sponsorship_available: null }));
    expect(rows.map((row) => row.map((fact) => fact.label))).toEqual([["Level", "Pay"], ["Location"], ["Visa sponsorship", "Experience"]]);
    expect(rows[0][1].value).toBe("Not listed");
    expect(rows[2][0].value).toBe("Not listed");
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
});

describe("the Apply button's state", () => {
  test("Apply until you apply, Applied with its day, then the stage it reached", () => {
    const base = { title: "Software Engineer", location: "Remote", salary: null, posted_at: null, first_seen_at: "2026-10-01T00:00:00Z" };
    expect(applyButtonState(base, false, true)).toEqual({ kind: "apply", closed: true });
    expect(applyButtonState({ ...base, applied_at: "2026-10-14T15:00:00", application_stage: "applied" }, true, false)).toEqual({ kind: "applied", date: "Oct 14" });
    expect(applyButtonState({ ...base, application_stage: "interview" }, true, false)).toEqual({ kind: "stage", stage: "interview", label: "Interviewing" });
  });
});
