import { describe, expect, test } from "bun:test";
import { autoApplyValue, howManyLabel, pausedLine } from "../apps/native/src/features/redesign/apply-flow/auto-apply-facts";

describe("auto-apply settings", () => {
  test("You's row says how a strong match is handled, or that it's paused", () => {
    expect(autoApplyValue({ mode: "ask", paused_until: null })).toBe("Ask me");
    expect(autoApplyValue({ mode: "auto", paused_until: null })).toBe("Apply for me");
    expect(autoApplyValue({ mode: "off", paused_until: null })).toBe("Off");
    expect(autoApplyValue({ mode: "auto", paused_until: "2026-10-30T17:00:00.000Z" })).toBe("Paused");
  });

  test("how many is the plan's sends", () => {
    expect(howManyLabel({ limit: 3, per: "week" })).toBe("3 a week");
    expect(howManyLabel({ limit: 10, per: "day" })).toBe("Up to 10 a day");
    expect(howManyLabel(undefined)).toBeUndefined();
  });

  test("Pause says until when, or just Paused until it's turned back on", () => {
    expect(pausedLine({ paused_until: null, paused_indefinitely: false })).toBeNull();
    expect(pausedLine({ paused_until: "2026-10-30T17:00:00.000Z", paused_indefinitely: false }, "America/Chicago")).toBe("Paused until Fri, Oct 30");
    expect(pausedLine({ paused_until: "9999-12-31T00:00:00.000Z", paused_indefinitely: true })).toBe("Paused");
  });
});
