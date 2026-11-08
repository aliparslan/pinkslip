import { describe, expect, it } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/** Every buzz goes through `src/platform/haptics.ts`, so the rule in
 * docs/design-system.md ("Haptics") has one place to hold
 * (docs/haptics-rule-2026-11-08.md). */
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

describe("haptics", () => {
  it("only the platform helper calls expo-haptics", () => {
    const root = join(import.meta.dir, "../apps/native/src");
    const direct = files(root).filter((file) => !file.endsWith(join("platform", "haptics.ts")) && /from "expo-haptics"/.test(readFileSync(file, "utf8")));
    expect(direct).toEqual([]);
  });
});
