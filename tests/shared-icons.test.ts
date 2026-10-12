import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { ICONS } from "../shared/icons";

// Both apps draw these from Phosphor; each name must be a real icon. (The iOS
// app's type check also fails when its component map misses a name.)
const phosphor = join(import.meta.dir, "../apps/webapp/node_modules/@phosphor-icons/react/dist/csr");

describe("the shared icon table", () => {
  test.each(Object.entries(ICONS))("%s has a Phosphor icon", (_name, icon) => {
    expect(existsSync(join(phosphor, `${icon}.es.js`))).toBe(true);
  });
});
