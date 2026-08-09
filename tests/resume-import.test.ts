import { describe, expect, test } from "bun:test";
import { parseResumeText } from "../packages/client/src/lib/pdf-to-profile";
import { normalizeConvertedResumeText } from "../worker/routes/resume-import";

describe("server resume conversion normalization", () => {
  test("discards Markdown syntax while preserving rows and link targets", () => {
    const normalized = normalizeConvertedResumeText(`---
title: resume
---
# Jane Doe
[jane@example.com](mailto:jane@example.com)
## Experience
- Built a parser
| Company | Dates |
| --- | --- |
| Acme | 2024 |`);

    expect(normalized).toContain("Jane Doe");
    expect(normalized).toContain("jane@example.com mailto:jane@example.com");
    expect(normalized).toContain("• Built a parser");
    expect(normalized).toContain("Company | Dates");
    expect(normalized).not.toContain("---");
    expect(normalized).not.toContain("##");
  });

  test("reconstructs fused company, school, degree, and date rows", () => {
    const normalized = normalizeConvertedResumeText(`# resume.pdf
## Contents
### Page 1
# Jane Doe
jane@example.com
## Work Experience
Acme Labs Austin, TXSenior Software EngineerJanuary 2024 – Present
- • Built a reliable service
## Education
Example University Austin, TXMaster of Computer Science, GPA: 3.9May 2025BA in MathematicsMay 2023`);
    const profile = parseResumeText(normalized);

    expect(normalized).not.toContain("resume.pdf");
    expect(profile.experience?.[0]).toMatchObject({
      company: "Acme Labs",
      title: "Senior Software Engineer",
      location: "Austin, TX",
    });
    expect(profile.experience?.[0].bullets).toEqual(["Built a reliable service"]);
    expect(profile.education?.[0]).toMatchObject({
      institution: "Example University",
      location: "Austin, TX",
      gpa: "3.9",
    });
    expect(profile.education?.[0].credentials).toHaveLength(2);
    expect(profile.education?.[0].credentials.map((credential) => credential.fieldsOfStudy)).toEqual([
      ["Computer Science"],
      ["Mathematics"],
    ]);
  });
});
