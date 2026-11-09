import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ICONS } from "../shared/icons";
import { TAB_ICON_FILLS, type TabIconName } from "../apps/native/src/ui/tab-icons";

/** The first shape of a Phosphor icon's regular weight: its outer edge. */
function restingEdge(name: TabIconName): string {
  const source = readFileSync(join(import.meta.dir, `../apps/native/node_modules/phosphor-react-native/src/defs/${ICONS[name]}.tsx`), "utf8");
  const regular = source.slice(source.indexOf("'regular'"));
  const path = /d="([^"]+)"/.exec(regular)![1]!;
  const next = path.slice(1).search(/[Mm]/);
  return next < 0 ? path : path.slice(0, next + 1);
}

describe("selected tab icons", () => {
  for (const [name, fill] of Object.entries(TAB_ICON_FILLS) as [TabIconName, NonNullable<(typeof TAB_ICON_FILLS)[TabIconName]>][]) {
    test(`${name} keeps the resting icon's outer edge`, () => {
      expect(fill.solid.startsWith(restingEdge(name))).toBe(true);
    });
  }
});
