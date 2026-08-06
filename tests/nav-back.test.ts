import { describe, expect, test } from "bun:test";
import { backSwipeIntent } from "../packages/client/src/lib/nav-back";

describe("native back-swipe intent", () => {
  test("waits for a deliberate gesture", () => {
    expect(backSwipeIntent(4, 4)).toBe("pending");
    expect(backSwipeIntent(6, 0)).toBe("back");
  });

  test("claims only a rightward horizontal gesture", () => {
    expect(backSwipeIntent(14, 3)).toBe("back");
    expect(backSwipeIntent(-14, 3)).toBe("other");
    expect(backSwipeIntent(4, 14)).toBe("other");
  });
});
