import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const repoRoot = resolve(import.meta.dir, "..");
const worldSources = ["packages/core/src", "packages/data/src"].flatMap((dir) => sourceFiles(resolve(repoRoot, dir)));
const nativeTokens = resolve(repoRoot, "packages/tokens/src/native.ts");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

const forbidden = [
  /from\s+["']svelte/,
  /from\s+["']react-dom/,
  /\bdocument\./,
  /\bwindow\./,
  /\blocalStorage\b/,
  /\bindexedDB\b/,
];

describe("native bundle boundaries", () => {
  test("shared runtime packages stay free of DOM and Svelte dependencies", () => {
    const violations: string[] = [];
    for (const file of [...worldSources, nativeTokens]) {
      const source = readFileSync(file, "utf8");
      for (const pattern of forbidden) {
        if (pattern.test(source)) violations.push(`${relative(repoRoot, file)} matches ${pattern}`);
      }
    }
    expect(violations).toEqual([]);
  });

  test("native tokens are CONVERTED values, not CSS strings", async () => {
    const native = await import("../packages/tokens/src/native");
    expect(native.color.dark.bg).toMatch(/^#[0-9a-f]{6}$/);
    expect(native.color.dark.scrim).toMatch(/^rgba\(/);
    expect(JSON.stringify(native.color)).not.toContain("oklch");
    expect(JSON.stringify(native.space)).not.toContain("px");
  });
});
