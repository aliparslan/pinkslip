import { describe, expect, test } from "bun:test";
import {
  sheetDragIntent,
  shouldDismissSheet,
} from "../packages/client/src/lib/drag-dismiss";

describe("sheet drag dismissal", () => {
  test("claims only a clear downward gesture from the top of a scroll area", () => {
    expect(sheetDragIntent(2, 5, 0)).toBe("pending");
    expect(sheetDragIntent(10, 8, 0)).toBe("scroll");
    expect(sheetDragIntent(1, -12, 0)).toBe("scroll");
    expect(sheetDragIntent(1, 14, 20)).toBe("scroll");
    expect(sheetDragIntent(1, 14, 0)).toBe("drag");
  });

  test("dismisses from deliberate distance or downward release velocity", () => {
    expect(shouldDismissSheet(80, 400, 0.2)).toBe(false);
    expect(shouldDismissSheet(111, 400, 0.2)).toBe(true);
    expect(shouldDismissSheet(25, 200, 0.7)).toBe(true);
  });
});
