import { describe, expect, test } from "bun:test";
import { createEmptyResumeProfile } from "../shared/resume-profile";
import {
  assessResumeImportFields,
  assessResumeImportQuality,
  chooseBestResumeImport,
  resumeImportQualityScore,
  shouldRequestServerResumeImport,
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

  test("accepts a complete local parse without requiring every optional section", () => {
    const local = {
      ...createEmptyResumeProfile(),
      contact: {
        ...createEmptyResumeProfile().contact,
        name: "Jane Doe",
        email: "jane@example.com",
      },
      education: [{
        id: "school-1",
        institution: "Example University",
        location: "Austin, TX",
        startDate: "August 2022",
        endDate: "May 2026",
        minors: [],
        credentials: [{
          id: "degree-1",
          degreeType: "bachelor" as const,
          fieldsOfStudy: ["Computer Science"],
        }],
      }],
    };

    expect(assessResumeImportQuality(local)).toMatchObject({ materiallyWeak: false });
    expect(shouldRequestServerResumeImport(local)).toBe(false);
  });

  test("requests a second extractor for fused or incomplete rows", () => {
    const fused = {
      ...createEmptyResumeProfile(),
      contact: {
        ...createEmptyResumeProfile().contact,
        name: "Jane Doe",
        email: "jane@example.com",
      },
      experience: [{
        id: "role-1",
        company: "",
        title: "Example University Austin, TXBachelor of Science",
        location: "",
        startDate: "",
        endDate: "May 2026",
        bullets: [],
      }],
    };

    expect(assessResumeImportQuality(fused).reasons).toEqual(expect.arrayContaining([
      "incomplete_experience",
      "suspicious_fused_fields",
    ]));
    expect(shouldRequestServerResumeImport(fused)).toBe(true);
  });

  test("identifies the exact imported fields that need human review", () => {
    const profile = {
      ...createEmptyResumeProfile(),
      contact: {
        ...createEmptyResumeProfile().contact,
        name: "Jane Doe",
        email: "jane@example.com",
      },
      education: [{
        id: "school-1",
        institution: "",
        location: "Austin",
        startDate: "2022",
        endDate: "May 2026",
        minors: [],
        credentials: [{
          id: "degree-1",
          degreeType: "bachelor" as const,
          fieldsOfStudy: ["Example University | Computer Science"],
        }],
      }],
    };

    const assessment = assessResumeImportFields(profile);
    expect(assessment.overall).toBe("low");
    expect(assessment.reviewPaths).toEqual(expect.arrayContaining([
      "education.school-1.institution",
      "education.school-1.location",
      "education.school-1.credentials.degree-1.fieldsOfStudy.0",
    ]));
    expect(assessment.fields.find((item) => item.path.endsWith("fieldsOfStudy.0"))).toMatchObject({
      confidence: "low",
      reason: "fused",
    });
  });
});
