import { describe, expect, test } from "bun:test";
import {
  createEmptyResumeProfile,
  normalizeResumeProfile,
} from "../shared/resume-profile";

describe("ResumeProfile v2 education hydration", () => {
  test("does not hydrate an unsupported profile schema", () => {
    const profile = normalizeResumeProfile({
      ...createEmptyResumeProfile(),
      schemaVersion: 1,
      contact: { name: "Unsupported" },
    });

    expect(profile).toEqual(createEmptyResumeProfile());
  });

  test("round-trips multiple credentials, majors, and minors at one school", () => {
    const profile = normalizeResumeProfile({
      ...createEmptyResumeProfile(),
      education: [{
        id: "school-2",
        institution: "Example College",
        credentials: [
          { id: "degree-1", degreeType: "bachelor", fieldsOfStudy: ["Computer Science", "Design"] },
          { id: "degree-2", degreeType: "certificate", fieldsOfStudy: ["Data Science"] },
        ],
        minors: ["Mathematics", "Economics"],
        location: "Chicago, IL",
        startDate: "2020",
        endDate: "2024",
      }],
    });

    expect(normalizeResumeProfile(JSON.parse(JSON.stringify(profile)))).toEqual(profile);
  });

  test("ignores malformed null attendance records instead of failing the profile read", () => {
    const hydrated = normalizeResumeProfile({
      ...createEmptyResumeProfile(),
      education: [null],
    });
    expect(hydrated.education).toEqual([]);
  });
});
