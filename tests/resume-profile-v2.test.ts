import { describe, expect, test } from "bun:test";
import {
  createEmptyResumeProfile,
  normalizeResumeProfile,
  withLegacyResumeAliases,
} from "../shared/resume-profile";

describe("ResumeProfile v2 education hydration", () => {
  test("upgrades a legacy degree into one credential without losing shared fields", () => {
    const profile = normalizeResumeProfile({
      ...createEmptyResumeProfile(),
      schemaVersion: 1,
      education: [{
        id: "school-1",
        institution: "Example University",
        degree: "Bachelor of Science, Computer Science",
        degreeType: "bachelor",
        fieldOfStudy: "Computer Science",
        location: "Austin, TX",
        startDate: "August 2020",
        endDate: "May 2024",
        gpa: "3.8",
      }],
    });

    expect(profile.schemaVersion).toBe(2);
    expect(profile.education).toEqual([{
      id: "school-1",
      institution: "Example University",
      credentials: [{
        id: expect.stringMatching(/^credential-/),
        degreeType: "bachelor",
        fieldsOfStudy: ["Computer Science"],
      }],
      minors: [],
      location: "Austin, TX",
      startDate: "August 2020",
      endDate: "May 2024",
      gpa: "3.8",
    }]);
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

  test("adds v1 degree aliases without discarding v2 credentials", () => {
    const source = normalizeResumeProfile({
      ...createEmptyResumeProfile(),
      education: [{
        id: "school-1",
        institution: "Example University",
        credentials: [
          { id: "degree-1", degreeType: "bachelor", fieldsOfStudy: ["Computer Science", "Design"] },
          { id: "degree-2", degreeType: "master", fieldsOfStudy: ["Data Science"] },
        ],
        minors: ["Economics"],
        location: "Austin, TX",
        startDate: "2018",
        endDate: "2024",
      }],
    });

    const legacy = withLegacyResumeAliases(source);
    expect(legacy.education[0]).toMatchObject({
      degree: "Bachelor's degree in Computer Science and Design",
      degreeType: "bachelor",
      fieldOfStudy: "Computer Science and Design",
    });
    expect(legacy.education[0].credentials).toHaveLength(2);
    expect(legacy.education[0].minors).toEqual(["Economics"]);
  });

  test("folds edits from an installed v1 client into the first credential", () => {
    const source = normalizeResumeProfile({
      ...createEmptyResumeProfile(),
      education: [{
        id: "school-1",
        institution: "Example University",
        credentials: [
          { id: "degree-1", degreeType: "bachelor", fieldsOfStudy: ["Computer Science"] },
          { id: "degree-2", degreeType: "master", fieldsOfStudy: ["Data Science"] },
        ],
        minors: [],
        location: "",
        startDate: "",
        endDate: "",
      }],
    });
    const legacy = withLegacyResumeAliases(source);
    legacy.education[0].degree = "Bachelor's degree in Software Engineering";
    legacy.education[0].degreeType = "bachelor";
    legacy.education[0].fieldOfStudy = "Software Engineering";

    const hydrated = normalizeResumeProfile(legacy);
    expect(hydrated.education[0].credentials[0].fieldsOfStudy).toEqual(["Software Engineering"]);
    expect(hydrated.education[0].credentials[1].fieldsOfStudy).toEqual(["Data Science"]);
  });

  test("ignores malformed null attendance records instead of failing the profile read", () => {
    const hydrated = normalizeResumeProfile({
      ...createEmptyResumeProfile(),
      education: [null],
    });
    expect(hydrated.education).toEqual([]);
  });
});
