import { describe, expect, test } from "bun:test";
import { roleAffinity } from "../shared/role-affinity";

describe("role affinity", () => {
  test("treats every selected role equally, then adjacent and unrelated roles", () => {
    const selected = ["backend", "frontend"] as const;
    expect(roleAffinity("backend", "backend", selected)).toBe(1);
    expect(roleAffinity("frontend", "backend", selected)).toBe(1);
    expect(roleAffinity("infrastructure", "backend", selected)).toBe(0.75);
    expect(roleAffinity("machine_learning", "backend", selected)).toBe(0);
  });
});
