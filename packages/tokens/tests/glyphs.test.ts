import { describe, expect, test } from "bun:test";
import { auditFonts, checkGlyphs, REQUIRED_PUNCTUATION, TRIAL_FONTS } from "../scripts/glyphs";

describe("font glyph coverage", () => {
  test("matches the recorded contract", () => {
    expect(checkGlyphs()).toEqual([]);
  });

  test("recognizes the current trial files", () => {
    const audits = auditFonts();
    expect(audits.map((audit) => audit.file)).toEqual(Object.keys(TRIAL_FONTS).sort());
    for (const audit of audits) expect(audit.trialCoverage).toBe(",-.");
  });

  test("requires the punctuation the product renders", () => {
    for (const character of [":", "(", "$", "%", "/", "'", "…"]) {
      expect(REQUIRED_PUNCTUATION).toContain(character);
    }
  });

  test("reads real cmaps rather than empty tables", () => {
    for (const audit of auditFonts()) expect(audit.codepoints).toBeGreaterThan(60);
  });
});
