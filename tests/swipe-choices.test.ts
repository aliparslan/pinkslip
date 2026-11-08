import { describe, expect, test } from "bun:test";
import { DEFAULT_SWIPES, repairSwipes, withSwipe } from "../apps/native/src/features/jobs/swipe-rules";

describe("choosing swipe actions", () => {
  test("a choice in another slot trades places with the one it replaces", () => {
    expect(withSwipe(DEFAULT_SWIPES, "right", 1, "hide")).toEqual({ right: ["save", "hide"], left: ["read", "applied"] });
    expect(withSwipe(DEFAULT_SWIPES, "right", 0, "read")).toEqual({ right: ["read", "save"], left: ["hide", "applied"] });
  });

  test("the full swipe takes neither none nor Queue", () => {
    expect(withSwipe(DEFAULT_SWIPES, "right", 0, null)).toBe(DEFAULT_SWIPES);
    expect(withSwipe(DEFAULT_SWIPES, "right", 0, "queue")).toBe(DEFAULT_SWIPES);
  });

  test("the inner button can be none or Queue", () => {
    expect(withSwipe(DEFAULT_SWIPES, "left", 1, null)).toEqual({ right: ["save", "read"], left: ["hide", null] });
    expect(withSwipe(DEFAULT_SWIPES, "right", 1, "queue")).toEqual({ right: ["save", "queue"], left: ["hide", "applied"] });
  });

  test("Queue never lands on the edge, even by a swap", () => {
    const queued = withSwipe(DEFAULT_SWIPES, "right", 1, "queue");
    // Hide (left's full swipe) picked for right's inner button: Queue would
    // have gone to the left edge, so it moves inside and Applied comes out.
    expect(withSwipe(queued, "right", 1, "hide")).toEqual({ right: ["save", "hide"], left: ["applied", "queue"] });
  });

  test("anything stored badly comes back usable", () => {
    expect(repairSwipes({ right: ["queue", null], left: ["hide", "hide"] })).toEqual({ right: ["save", "queue"], left: ["hide", null] });
    expect(repairSwipes({ right: ["nope", 3], left: [] })).toEqual({ right: ["save", null], left: ["read", null] });
  });
});
