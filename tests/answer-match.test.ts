import { describe, expect, test } from "bun:test";
import type { SavedApplicationAnswer } from "../shared/application-answers";
import { questionKind, suggestAnswer } from "../apps/native/src/features/apply/answer-match";

const saved = (label: string, value: SavedApplicationAnswer["value"], updated = "2026-10-10T00:00:00Z"): SavedApplicationAnswer => ({
  key: `q:${label}`, label, value, updated_at: updated,
});

describe("matching a blank to a saved answer", () => {
  test("knows the common kinds of question by their wording", () => {
    expect(questionKind("Why Stripe? *", "Stripe")).toBe("why_company");
    expect(questionKind("Why do you want to work at Datadog?")).toBe("why_company");
    expect(questionKind("What interests you about joining us?")).toBe("why_company");
    expect(questionKind("Why are you interested in this role?")).toBe("why_role");
    expect(questionKind("Tell us about a past data-related project you've worked on")).toBe("project");
    expect(questionKind("Anything else you'd like us to know?")).toBe("anything_else");
    expect(questionKind("Who is your current or previous employer?")).toBeNull();
  });

  test("offers the newest answer of the same kind, as written", () => {
    const answers = [
      saved("Why do you want to work at Datadog?", "I've wanted to build payments infrastructure since my first side project."),
      saved("Why Ramp?", "Older answer"),
    ];
    expect(suggestAnswer("Why Stripe?", answers, "Stripe")).toEqual({
      title: "Why this company",
      answer: "I've wanted to build payments infrastructure since my first side project.",
      key: "q:Why do you want to work at Datadog?",
    });
  });

  test("falls back to a question with most of the same words", () => {
    const answers = [saved("What is your expected graduation date?", "May 2027")];
    expect(suggestAnswer("Expected graduation date", answers)).toMatchObject({ answer: "May 2027" });
    expect(suggestAnswer("Who is your current employer?", answers)).toBeNull();
  });

  test("leaves out choices: they belong to their dropdowns", () => {
    expect(suggestAnswer("Why Stripe?", [saved("Why Ramp?", ["Yes"])], "Stripe")).toBeNull();
  });
});
