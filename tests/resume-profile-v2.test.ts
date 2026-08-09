import { describe, expect, test } from "bun:test";
import {
  createEmptyResumeProfile,
  normalizeResumeProfile,
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
});
