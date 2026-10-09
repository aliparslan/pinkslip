import { describe, expect, test } from "bun:test";
import { checkOutputs } from "../scripts/generate";
import { oklchToNative, parseOklch } from "../src/oklch";
import { color, fontSize, radius, shadow, space } from "../src/native";
import type { ColorToken, FontSizeToken, SpaceToken, ThemeName } from "../src/types";

describe("generated token files", () => {
  test("are current with the source of truth", () => {
    expect(checkOutputs()).toEqual([]);
  });
});

describe("oklch conversion", () => {
  test("converts opaque colors to hex", () => {
    expect(oklchToNative("oklch(1 0 0)")).toBe("#ffffff");
    expect(oklchToNative("oklch(0 0 0)")).toBe("#000000");
  });

  test("keeps alpha as rgba", () => {
    expect(oklchToNative("oklch(1 0 0 / 0.1)")).toBe("rgba(255, 255, 255, 0.1)");
  });

  test("rejects colors outside sRGB instead of gamut-mapping them", () => {
    expect(() => oklchToNative("oklch(0.7 0.4 30)")).toThrow(/outside sRGB/);
  });

  test("accepts only the plain oklch() form", () => {
    expect(parseOklch("oklch(0.5 0.1 200)")).toEqual({ l: 0.5, c: 0.1, h: 200, alpha: 1 });
    expect(() => parseOklch("rgb(0 0 0)")).toThrow();
  });
});

describe("native values", () => {
  test("every mode defines every semantic color", () => {
    const dark = Object.keys(color.dark).sort();
    for (const mode of Object.keys(color) as ThemeName[]) {
      expect(Object.keys(color[mode]).sort()).toEqual(dark);
    }
  });

  test("converts lengths to numbers at the 16px web root", () => {
    expect(space["4"]).toBe(16);
    expect(fontSize.md).toBe(16);
    expect(fontSize["3xs"]).toBe(11);
    expect(radius.full).toBe(999);
  });

  test("resolves var() aliases per mode instead of emitting them", () => {
    expect(color.dark["input-bg"]).toBe(color.dark["control-bg"]);
    expect(color.light["input-bg"]).toBe(color.light["control-bg"]);
    expect(color.light["input-bg"]).not.toBe(color.dark["input-bg"]);
  });

  test("shadows keep geometry and a converted color", () => {
    expect(shadow.dark.overlay).toEqual({ x: 0, y: 18, blur: 54, color: "rgba(0, 0, 0, 0.32)" });
    expect(shadow.light.sheet.y).toBe(-8);
  });

  test("union types stay aligned with runtime keys", () => {
    const tone: ColorToken = "ink-3";
    const gap: SpaceToken = "4";
    const size: FontSizeToken = "3xs";
    expect(color.dark[tone]).toBeString();
    expect(space[gap]).toBeNumber();
    expect(fontSize[size]).toBeNumber();
  });
});
