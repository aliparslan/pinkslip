import { describe, expect, test } from "bun:test";
import { normalizedDescriptionHeadingLevel } from "../apps/webapp/src/features/jobs/job-content";

describe("normalizedDescriptionHeadingLevel", () => {
  test("moves an ATS h1 outline below the app-owned h2", () => {
    expect(normalizedDescriptionHeadingLevel(1, 1)).toBe(3);
    expect(normalizedDescriptionHeadingLevel(2, 1)).toBe(4);
    expect(normalizedDescriptionHeadingLevel(4, 1)).toBe(6);
  });

  test("preserves an outline that already begins below the app section", () => {
    expect(normalizedDescriptionHeadingLevel(3, 3)).toBe(3);
    expect(normalizedDescriptionHeadingLevel(5, 3)).toBe(5);
  });

  test("caps deeply nested headings at h6", () => {
    expect(normalizedDescriptionHeadingLevel(6, 2)).toBe(6);
  });
});
