import { describe, expect, test } from "bun:test";
import { adaptResumeForAts } from "../shared/ats-application";
import { createEmptyResumeProfile } from "../shared/resume-profile";

describe("ATS application projections", () => {
  const profile = {
    ...createEmptyResumeProfile(),
    education: [{
      id: "school-1",
      institution: "Example University",
      location: "Austin, TX",
      startDate: "2020",
      endDate: "2024",
      gpa: "3.8",
      minors: ["Design"],
      credentials: [{
        id: "credential-1",
        degreeType: "bachelor" as const,
        fieldsOfStudy: ["Computer Science", "Mathematics"],
      }],
    }],
  };

  test("flattens Greenhouse's single-discipline education records without changing the profile", () => {
    const payload = adaptResumeForAts(profile, "greenhouse");
    expect(payload.education).toHaveLength(2);
    expect(payload.education.map((entry) => entry.discipline)).toEqual(["Computer Science", "Mathematics"]);
    expect(payload.education.every((entry) => entry.institution === "Example University")).toBe(true);
    expect(profile.education).toHaveLength(1);
  });

  test("keeps one school record when the target can accept grouped credentials", () => {
    const payload = adaptResumeForAts(profile, "generic");
    expect(payload.education).toHaveLength(1);
    expect(payload.education[0].discipline).toBe("Computer Science; Mathematics; Minor: Design");
  });
});
