import { describe, expect, test } from "bun:test";
import {
  boundedOcrRenderScale,
  MAX_OCR_PAGES,
  ocrPageNumbers,
} from "../src/lib/pdf-extract";

describe("mobile PDF OCR rendering bounds", () => {
  test("renders only the first bounded set of resume pages", () => {
    expect(ocrPageNumbers(0)).toEqual([]);
    expect(ocrPageNumbers(2)).toEqual([1, 2]);
    expect(ocrPageNumbers(20)).toEqual(
      Array.from({ length: MAX_OCR_PAGES }, (_, index) => index + 1),
    );
  });

  test("keeps a letter page legible without exceeding mobile canvas limits", () => {
    const scale = boundedOcrRenderScale(612, 792);
    const width = 612 * scale;
    const height = 792 * scale;
    expect(scale).toBeGreaterThan(1);
    expect(Math.max(width, height)).toBeLessThanOrEqual(1_800);
    expect(width * height).toBeLessThanOrEqual(2_500_000);
  });

  test("scales unusually large pages down instead of allocating an unbounded canvas", () => {
    const scale = boundedOcrRenderScale(4_000, 3_000);
    expect(scale).toBeLessThan(1);
    expect(4_000 * scale).toBeLessThanOrEqual(1_800);
    expect((4_000 * scale) * (3_000 * scale)).toBeLessThanOrEqual(2_500_000);
  });
});
