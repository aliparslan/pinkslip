import { describe, expect, it } from "vitest";
import { parseTailoringText } from "@worker/tailor/parse";

describe("parseTailoringText", () => {
  it("splits streamed output into resume, cover, and qa sections", () => {
    const parsed = parseTailoringText(`=== RESUME ===
resume body

=== COVER ===
cover body

=== QA ===
{"why_company":"Because","biggest_project":"X"}`);

    expect(parsed.resume_md).toBe("resume body");
    expect(parsed.cover_letter_md).toBe("cover body");
    expect(JSON.parse(parsed.qa_json)).toMatchObject({
      why_company: "Because",
      biggest_project: "X",
    });
  });

  it("falls back when the qa section is not valid json", () => {
    const parsed = parseTailoringText(`=== RESUME ===
resume
=== COVER ===
cover
=== QA ===
why_company: very excited`);

    expect(JSON.parse(parsed.qa_json)).toMatchObject({
      why_company: "why_company: very excited",
    });
  });
});
