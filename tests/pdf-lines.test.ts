import { describe, expect, test } from "bun:test";
import { pdfTextLines, type PdfTextItem } from "../packages/core/src/pdf-lines";

const run = (str: string, x: number, y: number, width = str.length * 5, height = 10): PdfTextItem => ({
  str, transform: [height, 0, 0, height, x, y], width, height,
});

describe("lines rebuilt from a PDF's text items", () => {
  test("joins runs on one baseline and starts a line on the next", () => {
    expect(pdfTextLines([run("Jordan", 50, 700), run("Lee", 83, 700), run("Education", 50, 680)]))
      .toEqual(["Jordan Lee", "Education"]);
  });

  test("keeps a right-aligned date on its row after a column mark, even behind LaTeX's wide space", () => {
    const items = [run("Northwind Bank", 50, 700, 70), run(" ", 120, 700, 300, 0), run("Aug 2025 – Present", 480, 700, 85)];
    expect(pdfTextLines(items)).toEqual(["Northwind Bank | Aug 2025 – Present"]);
  });

  test("keeps a superscript on its line and the PDF's order for columns", () => {
    expect(pdfTextLines([run("GPA 3.9", 50, 700), run("*", 86, 703, 3, 6)])).toEqual(["GPA 3.9*"]);
    // A sidebar written first, then the main column from the top again.
    expect(pdfTextLines([run("Skills", 40, 700), run("Go, SQL", 40, 688), run("Experience", 220, 700)]))
      .toEqual(["Skills", "Go, SQL", "Experience"]);
  });

  test("leaves out empty runs and marked content", () => {
    expect(pdfTextLines([run("", 50, 700), run("Projects", 50, 690), { str: "", transform: [], width: 0, height: 0 }]))
      .toEqual(["Projects"]);
  });
});
