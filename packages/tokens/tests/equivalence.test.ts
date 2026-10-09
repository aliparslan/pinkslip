import { describe, expect, test } from "bun:test";
import { compareEquivalence } from "../scripts/equivalence";

describe("token equivalence", () => {
  test("every resolved value matches the frozen Svelte styles until 3.4", () => {
    const result = compareEquivalence();
    expect(result.status).not.toBe("failed");
    if (result.status === "failed") expect(result.problems).toEqual([]);
    if (result.status === "compared") {
      expect(result.contexts).toBe(32);
      expect(result.tokens).toBeGreaterThan(90);
    }
  });
});
