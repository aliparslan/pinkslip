import { describe, expect, test } from "bun:test";
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
});
