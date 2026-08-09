import { describe, expect, test } from "bun:test";
import { createEmptyResumeProfile } from "../shared/resume-profile";
import {
  chooseBestResumeImport,
  resumeImportQualityScore,
} from "../packages/client/src/lib/resume-import-quality";

describe("resume import quality selection", () => {
  test("prefers structured school and employer fields over a longer fused conversion", () => {
    const server = {
      ...createEmptyResumeProfile(),
      experience: [{
        id: "role-1",
        company: "",
        title: "Acme Labs Austin, TXSenior Software Engineer",
        location: "",
        startDate: "January 2024",
        endDate: "Present",
        bullets: ["Built a reliable service"],
      }],
      education: [{
        id: "school-1",
        institution: "",
        location: "",
        startDate: "",
        endDate: "May 2025",
        gpa: "3.9",
        minors: [],
        credentials: [{
          id: "degree-1",
          degreeType: "other" as const,
          fieldsOfStudy: ["Example University Austin, TXMaster of Computer Science"],
        }],
      }],
    };
    const local = {
      ...createEmptyResumeProfile(),
      experience: [{
        id: "role-1",
        company: "Acme Labs",
        title: "Senior Software Engineer",
        location: "Austin, TX",
        startDate: "January 2024",
        endDate: "Present",
        bullets: ["Built a reliable service"],
      }],
      education: [{
        id: "school-1",
        institution: "Example University",
        location: "Austin, TX",
        startDate: "",
        endDate: "May 2025",
        gpa: "3.9",
        minors: [],
        credentials: [{
          id: "degree-1",
          degreeType: "master" as const,
          fieldsOfStudy: ["Computer Science"],
        }],
      }],
    };

    expect(resumeImportQualityScore(local)).toBeGreaterThan(resumeImportQualityScore(server));
    expect(chooseBestResumeImport(server, local)).toBe("local");
  });
});
