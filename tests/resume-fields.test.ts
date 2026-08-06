import { describe, expect, test } from "bun:test";
import {
  formatDegree,
  formatResumeDate,
  hasResumeContent,
  inferDegreeType,
  inferFieldOfStudy,
  joinUsLocation,
  monthInputValue,
  splitUsLocation,
} from "../packages/client/src/lib/resume-fields";

describe("resume fields", () => {
  test("splits and rejoins US city and state values", () => {
    expect(splitUsLocation("Chicago, IL, US")).toEqual({ city: "Chicago", state: "IL" });
    expect(splitUsLocation("Remote")).toEqual({ city: "Remote", state: "" });
    expect(joinUsLocation("Austin", "TX")).toBe("Austin, TX");
  });

  test("turns legacy degree text into structured fields", () => {
    const bachelors = inferDegreeType("B.S. Computer Science");
    expect(bachelors).toBe("bachelor");
    expect(inferFieldOfStudy("B.S. Computer Science", bachelors)).toBe("Computer Science");

    const masters = inferDegreeType("Master of Science in Data Science");
    expect(masters).toBe("master");
    expect(inferFieldOfStudy("Master of Science in Data Science", masters)).toBe("Data Science");
    expect(formatDegree("bachelor", "Computer Science")).toBe("Bachelor's degree, Computer Science");
    expect(formatDegree("other", "MBA")).toBe("MBA");
  });

  test("normalizes and formats resume months", () => {
    expect(monthInputValue("January 2022")).toBe("2022-01");
    expect(monthInputValue("2024-06")).toBe("2024-06");
    expect(formatResumeDate("2024-06")).toBe("Jun 2024");
    expect(formatResumeDate("Present")).toBe("Present");
  });

  test("distinguishes resume content from structural metadata", () => {
    expect(hasResumeContent({ id: "draft", degreeType: "bachelor", title: "" })).toBe(false);
    expect(hasResumeContent({ kind: "awards", items: [{ category: "", items: "" }] })).toBe(false);
    expect(hasResumeContent({ id: "draft", bullets: ["Improved load time by 20%"] })).toBe(true);
  });
});
