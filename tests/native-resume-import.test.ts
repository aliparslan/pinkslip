import { describe, expect, test } from "bun:test";
import { ApiError, type ResumeImportResult } from "../packages/core/src/api";
import { createEmptyResumeProfile } from "../shared/resume-profile";
import { parseWithOcr } from "../apps/native/src/features/resume/import-policy";

const result = (name = ""): ResumeImportResult => ({ profile: { ...createEmptyResumeProfile(), contact: { ...createEmptyResumeProfile().contact, name } },
  warnings: [], counts: { experience: 0, education: 0, projects: 0, skills: 0, additional: 0 }, assessment: {} as ResumeImportResult["assessment"] });

describe("native resume OCR fallback", () => {
  test("text resumes keep the fast path", async () => {
    let calls = 0;
    expect((await parseWithOcr(async () => result("Avery"), async () => { calls++; return result(); })).profile.contact.name).toBe("Avery");
    expect(calls).toBe(0);
  });
  test("missing text and empty parse results each recover through OCR", async () => {
    for (const parse of [async () => result(), async () => { throw new ApiError("No text", 422, "no_extractable_text"); }]) {
      expect((await parseWithOcr(parse, async () => result("Avery"))).profile.contact.name).toBe("Avery");
    }
  });
  test("protected, invalid, unavailable and rejected imports do not trigger another upload", async () => {
    for (const code of ["protected_pdf", "invalid_pdf", "authentication_required", "conversion_unavailable", "import_rate_limited"]) {
      let calls = 0;
      const failure = new ApiError(code, 422, code);
      await expect(parseWithOcr(async () => { throw failure; }, async () => { calls++; return result(); })).rejects.toBe(failure);
      expect(calls).toBe(0);
    }
  });
  test("a blank scan still gives the original usable failure", async () => {
    await expect(parseWithOcr(async () => result(), async () => result())).rejects.toMatchObject({ code: "no_extractable_text" });
  });
});
