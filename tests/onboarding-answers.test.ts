import { describe, expect, test } from "bun:test";
import { DEFAULT_SEARCH_PROFILE, ONBOARDING_VERSION, type SearchProfile } from "../shared/search-profile";
import {
  answer, canContinue, flipRemote, pickPlace, pickRole, pickStage, QUESTIONS, unanswered, withAnswer,
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

  test("an answer goes into the saved search, leaving the questions still to come as saved", () => {
    const saved = profile();
    const draft = { ...unanswered(saved), target_levels: ["early_career" as const] };
    const next = withAnswer(saved, "stage", draft, now);
    expect(next.target_levels).toEqual(["early_career"]);
    expect(next.roles).toEqual(saved.roles);
    expect(next.location_ids).toEqual(saved.location_ids);
    expect(next.onboarding_completed_at).toBeNull();
  });

  test("the last answer marks onboarding done", () => {
    const saved = profile();
    const draft = { ...unanswered(saved), location_ids: ["new_york" as const], work_modes: ["remote" as const, "onsite" as const, "hybrid" as const] };
    const next = withAnswer(saved, QUESTIONS[QUESTIONS.length - 1]!, draft, now);
    expect(next.location_ids).toEqual(["new_york"]);
    expect(next.work_modes).toContain("remote");
    expect(next.onboarding_version).toBe(ONBOARDING_VERSION);
    expect(next.onboarding_completed_at).toBe(now.toISOString());
  });
});
