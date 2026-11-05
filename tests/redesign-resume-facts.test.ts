import { describe, expect, test } from "bun:test";
import { addedLine, dateRange, shortSchool } from "../apps/native/src/features/redesign/resume/facts";

describe("Resume rows", () => {
  test("a range in one year names the year once; an ongoing one ends now", () => {
    expect(dateRange("2025-06", "2025-08")).toBe("Jun – Aug 2025");
    expect(dateRange("2023-09", "Present")).toBe("Sep 2023 – now");
    expect(dateRange("2022-09", "2025-05")).toBe("Sep 2022 – May 2025");
    expect(dateRange("", "2025-05")).toBe("May 2025");
    expect(dateRange("2025-01", "")).toBe("Jan 2025");
    expect(dateRange("", "Present")).toBe("");
  });

  test("a long school name shortens the way people say it", () => {
    expect(shortSchool("The University of Texas at Austin")).toBe("UT Austin");
    expect(shortSchool("The University of California at Berkeley")).toBe("UC Berkeley");
    expect(shortSchool("Georgia Tech")).toBe("Georgia Tech");
  });
});

describe("your resume's PDF", () => {
  test("says when it was added, with the year only when it isn't this one", () => {
    const now = new Date(2026, 10, 4, 12);
    expect(addedLine(new Date(2026, 9, 29, 9).toISOString(), now)).toBe("Added Oct 29");
    expect(addedLine(new Date(2025, 11, 3, 9).toISOString(), now)).toBe("Added Dec 3, 2025");
    expect(addedLine("not a date", now)).toBe("Added");
  });
});
