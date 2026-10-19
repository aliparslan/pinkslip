import { describe, expect, test } from "bun:test";
import { DEFAULT_SEARCH_PROFILE, ONBOARDING_VERSION, type SearchProfile } from "../shared/search-profile";
import {
  answer, answeredSearch, canContinue, everything, fitsAnswers, flipRemote, jobStages, pickPlace, pickRole, pickStage, unanswered,
} from "../apps/native/src/features/onboarding/answers";

const profile = (patch: Partial<SearchProfile> = {}): SearchProfile => ({ ...DEFAULT_SEARCH_PROFILE, ...patch });
const now = new Date("2026-10-18T20:00:00.000Z");

describe("onboarding's three questions", () => {
  test("start unanswered rather than ticked with the defaults", () => {
    const blank = unanswered(profile());
    expect(blank.target_levels).toEqual([]);
    expect(blank.roles).toEqual([]);
    expect(blank.location_ids).toEqual([]);
    expect(blank.relocation_willing).toBe(false);
    expect(blank.work_modes).not.toContain("remote");
    expect(blank.work_modes.length).toBeGreaterThan(0);
  });

  test("Continue waits for a stage and a role; where is answered as it stands", () => {
    const blank = unanswered(profile());
    expect(canContinue("stage", blank)).toBe(false);
    expect(canContinue("stage", { ...blank, target_levels: ["new_grad"] })).toBe(true);
    expect(canContinue("roles", blank)).toBe(false);
    expect(canContinue("roles", { ...blank, roles: ["backend"], primary_role: "backend" })).toBe(true);
    expect(canContinue("where", blank)).toBe(true);
  });

  test("a stage chip goes on and off, and the question can be emptied again", () => {
    const blank = unanswered(profile());
    const one = { ...blank, ...pickStage(blank, "new_grad") };
    expect(one.target_levels).toEqual(["new_grad"]);
    const none = { ...one, ...pickStage(one, "new_grad") };
    expect(none.target_levels).toEqual([]);
    expect(canContinue("stage", none)).toBe(false);
  });

  test("Any role is every role; a role chip turns it off; the last role off empties it", () => {
    const blank = unanswered(profile());
    const any = { ...blank, ...pickRole(blank, "any") };
    expect(canContinue("roles", any)).toBe(true);
    const backend = { ...any, ...pickRole(any, "backend") };
    expect(backend.roles).toEqual(["backend"]);
    const none = { ...backend, ...pickRole(backend, "backend") };
    expect(none.roles).toEqual([]);
    expect(canContinue("roles", none)).toBe(false);
  });

  test("a city turns Anywhere off, Anywhere clears the cities, and Remote sits beside them", () => {
    const blank = unanswered(profile());
    const nyc = { ...blank, ...pickPlace(blank, "new_york") };
    expect(nyc.location_ids).toEqual(["new_york"]);
    expect({ ...nyc, ...pickPlace(nyc, "anywhere") }.location_ids).toEqual([]);
    expect({ ...nyc, ...pickPlace(nyc, "new_york") }.location_ids).toEqual([]);
    const remote = { ...nyc, ...flipRemote(nyc) };
    expect(remote.work_modes).toContain("remote");
    expect(remote.location_ids).toEqual(["new_york"]);
    expect({ ...remote, ...flipRemote(remote) }.work_modes).not.toContain("remote");
  });

  test("each answer changes only its own part of the search", () => {
    const draft = { ...unanswered(profile()), target_levels: ["new_grad" as const], roles: ["backend" as const], primary_role: "backend" as const };
    expect(answer("stage", draft)).toEqual({ target_levels: ["new_grad"] });
    expect(answer("roles", draft)).toEqual({ roles: ["backend"], primary_role: "backend" });
    expect(Object.keys(answer("where", draft)).sort()).toEqual(["location_ids", "relocation_willing", "work_modes"]);
  });

  test("the answers go into the saved search together, marked done", () => {
    const saved = profile();
    const draft = {
      ...unanswered(saved), target_levels: ["early_career" as const], roles: ["backend" as const], primary_role: "backend" as const,
      location_ids: ["new_york" as const], work_modes: ["remote" as const, "onsite" as const, "hybrid" as const],
    };
    const next = answeredSearch(saved, draft, now);
    expect(next.target_levels).toEqual(["early_career"]);
    expect(next.roles).toEqual(["backend"]);
    expect(next.location_ids).toEqual(["new_york"]);
    expect(next.work_modes).toContain("remote");
    expect(next.max_required_years).toBe(saved.max_required_years);
    expect(next.onboarding_version).toBe(ONBOARDING_VERSION);
    expect(next.onboarding_completed_at).toBe(now.toISOString());
  });

  test("while the hook plays the search widens to everything", () => {
    const wide = everything(profile({ target_levels: ["new_grad"], roles: ["backend"], location_ids: ["austin"] }));
    expect(wide.target_levels.length).toBe(4);
    expect(wide.roles).toContain("data_engineering");
    expect(wide.location_ids).toEqual([]);
    expect(wide.work_modes).toContain("remote");
  });
});

describe("the feed behind the questions", () => {
  test("reads a job's career stage from its level line, as the server does", () => {
    expect(jobStages("Internship")).toEqual(["internship"]);
    expect(jobStages("New-grad role")).toEqual(["new_grad"]);
    expect(jobStages("Early-career role")).toEqual(["early_career"]);
    expect(jobStages("Asks for 2+ years")).toEqual(["early_career"]);
    expect(jobStages("Asks for 3+ years")).toEqual(["early_career", "mid_career"]);
    expect(jobStages("Asks for 5+ years")).toEqual(["mid_career"]);
    expect(jobStages("Asks for 8+ years")).toEqual([]);
    expect(jobStages("Experience not specified")).toBeNull();
  });

  const job = (patch: { match_fact?: string; specialties?: string[]; location?: string } = {}) =>
    ({ match_fact: "New-grad role", specialties: ["backend"], location: "New York, NY", ...patch });

  test("an empty question doesn't narrow it", () => {
    const blank = unanswered(profile());
    expect(fitsAnswers(job({ match_fact: "Internship", specialties: ["data_engineering"], location: "Remote" }), blank, false)).toBe(true);
  });

  test("stages and roles narrow it as soon as they're picked", () => {
    const draft = { ...unanswered(profile()), target_levels: ["new_grad" as const] };
    expect(fitsAnswers(job(), draft, false)).toBe(true);
    expect(fitsAnswers(job({ match_fact: "Internship" }), draft, false)).toBe(false);
    expect(fitsAnswers(job({ match_fact: "Experience not specified" }), draft, false)).toBe(true);
    const roles = { ...draft, roles: ["data_engineering" as const] };
    expect(fitsAnswers(job(), roles, false)).toBe(false);
    expect(fitsAnswers(job({ specialties: ["data_engineering", "backend"] }), roles, false)).toBe(true);
  });

  test("where counts once it's asked: a city by its names, Remote beside it", () => {
    const draft = { ...unanswered(profile()), location_ids: ["sf_bay" as const] };
    expect(fitsAnswers(job(), draft, false)).toBe(true);
    expect(fitsAnswers(job(), draft, true)).toBe(false);
    expect(fitsAnswers(job({ location: "Palo Alto, CA" }), draft, true)).toBe(true);
    expect(fitsAnswers(job({ location: "Remote - US" }), draft, true)).toBe(false);
    const remote = { ...draft, work_modes: ["remote" as const, "onsite" as const, "hybrid" as const] };
    expect(fitsAnswers(job({ location: "Remote - US" }), remote, true)).toBe(true);
  });
});
