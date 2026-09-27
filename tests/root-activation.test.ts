import { describe, expect, test } from "bun:test";
import { ActivationEdge } from "../packages/client/src/lib/activation";

describe("retained root activation", () => {
  test("ignores initial mount and reports each later activation once", () => {
    const activation = new ActivationEdge();

    expect(activation.becameActive(true)).toBe(false);
    expect(activation.becameActive(true)).toBe(false);
    expect(activation.becameActive(false)).toBe(false);
    expect(activation.becameActive(true)).toBe(true);
    expect(activation.becameActive(true)).toBe(false);
    expect(activation.becameActive(false)).toBe(false);
    expect(activation.becameActive(true)).toBe(true);
  });

  test("reports the first activation after an inactive warm mount", () => {
    const activation = new ActivationEdge();

    expect(activation.becameActive(false)).toBe(false);
    expect(activation.becameActive(true)).toBe(true);
  });
});
