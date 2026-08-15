import { describe, expect, test } from "bun:test";
import corpus from "./fixtures/resume-import/corpus.json";
import { parseResumeText } from "../packages/client/src/lib/pdf-to-profile";
import { assessResumeImportQuality } from "../packages/client/src/lib/resume-import-quality";

describe("sanitized resume import corpus", () => {
  for (const fixture of corpus) {
    test(fixture.name, () => {
      const profile = parseResumeText(fixture.text);
      expect(profile.experience?.length ?? 0).toBe(fixture.expected.experience);
      expect(profile.education?.length ?? 0).toBe(fixture.expected.education);
      expect(profile.projects?.length ?? 0).toBe(fixture.expected.projects);
      expect(profile.skills?.length ?? 0).toBe(fixture.expected.skills);
      if ("needsReview" in fixture.expected && fixture.expected.needsReview) {
        expect(assessResumeImportQuality(profile).materiallyWeak).toBe(true);
      }
      if ("institution" in fixture.expected && typeof fixture.expected.institution === "string") {
        expect(profile.education?.[0].institution).toBe(fixture.expected.institution);
      }
      if ("fieldOfStudy" in fixture.expected && typeof fixture.expected.fieldOfStudy === "string") {
        expect(profile.education?.[0].credentials[0].fieldsOfStudy).toEqual([
          fixture.expected.fieldOfStudy,
        ]);
      }
    });
  }
});
