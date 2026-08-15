import { describe, expect, test } from "bun:test";
import { compileTypstSource } from "../services/resume-compiler/server";

describe("isolated resume compiler", () => {
  test("reproduces identical PDF bytes for identical versioned source", async () => {
    const source = '#set text(font: "Source Sans 3", size: 11pt)\nHello Pinkslip';
    const first = await compileTypstSource(source);
    const second = await compileTypstSource(source);
    expect(new TextDecoder().decode(first.pdf.slice(0, 5))).toBe("%PDF-");
    expect(first.sourceSha256).toBe(second.sourceSha256);
    expect(first.pdfSha256).toBe(second.pdfSha256);
    expect(first.pdf).toEqual(second.pdf);
  }, 30_000);

  test("rejects empty input", async () => {
    await expect(compileTypstSource("  ")).rejects.toThrow("empty");
  });
});
