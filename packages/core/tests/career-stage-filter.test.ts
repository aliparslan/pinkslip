import { describe, expect, test } from "bun:test";
import {
  ALL_CAREER_STAGES,
  careerStageQuery,
  orderedCareerStages,
  reconcileCareerStageSelection,
  sameCareerStages,
} from "../src/career-stage-filter";

describe("career-stage feed filtering", () => {
  test("uses the public catalog order", () => {
    expect(ALL_CAREER_STAGES).toEqual([
      "internship",
      "new_grad",
      "early_career",
    ]);
    expect(orderedCareerStages(["early_career", "internship"])).toEqual([
      "internship",
      "early_career",
    ]);
  });

  test("omits the query when every saved stage is selected", () => {
    expect(careerStageQuery(ALL_CAREER_STAGES, ALL_CAREER_STAGES)).toBeUndefined();
    expect(sameCareerStages(ALL_CAREER_STAGES, ALL_CAREER_STAGES)).toBe(true);
  });

  test("serializes an exact proper subset in catalog order", () => {
    expect(careerStageQuery(
      ["early_career", "internship"],
      ALL_CAREER_STAGES,
    )).toBe("internship,early_career");
  });

  test("never emits a stage outside the saved preference", () => {
    expect(careerStageQuery(
      ["internship", "new_grad"],
      ["new_grad", "early_career"],
    )).toBe("new_grad");
  });

  test("preference resync constrains a draft and force-reset selects all saved stages", () => {
    expect(reconcileCareerStageSelection(
      ["internship", "early_career"],
      ALL_CAREER_STAGES,
      ["new_grad", "early_career"],
    )).toEqual({
      available: ["new_grad", "early_career"],
      selected: ["early_career"],
    });

    expect(reconcileCareerStageSelection(
      ["early_career"],
      ALL_CAREER_STAGES,
      ["new_grad", "early_career"],
      true,
    )).toEqual({
      available: ["new_grad", "early_career"],
      selected: ["new_grad", "early_career"],
    });
  });
});
