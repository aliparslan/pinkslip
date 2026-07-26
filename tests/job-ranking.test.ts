import { describe, expect, test } from "bun:test";
import { diversifyRankedJobs } from "@worker/job-ranking";
import { roleAffinity } from "../shared/role-affinity";

describe("role affinity", () => {
  test("orders primary, selected, adjacent, and unrelated roles", () => {
    const selected = ["backend", "frontend"] as const;
    expect(roleAffinity("backend", "backend", selected)).toBe(1);
    expect(roleAffinity("frontend", "backend", selected)).toBe(0.9);
    expect(roleAffinity("infrastructure", "backend", selected)).toBe(0.75);
    expect(roleAffinity("product_management", "backend", selected)).toBe(0);
  });
});

describe("company diversity", () => {
  test("balances the first screen without dropping results", () => {
    const rows = [
      ...Array.from({ length: 8 }, (_, index) => ({ id: `a-${index}`, company_id: "a" })),
      ...Array.from({ length: 4 }, (_, index) => ({ id: `b-${index}`, company_id: "b" })),
      ...Array.from({ length: 4 }, (_, index) => ({ id: `c-${index}`, company_id: "c" })),
      ...Array.from({ length: 4 }, (_, index) => ({ id: `d-${index}`, company_id: "d" })),
      ...Array.from({ length: 4 }, (_, index) => ({ id: `e-${index}`, company_id: "e" })),
    ];

    const ranked = diversifyRankedJobs(rows, 10);
    const counts = ranked.reduce<Record<string, number>>((acc, row) => {
      acc[row.company_id] = (acc[row.company_id] ?? 0) + 1;
      return acc;
    }, {});

    expect(ranked).toHaveLength(10);
    expect(Math.max(...Object.values(counts))).toBeLessThanOrEqual(2);
    expect(ranked.every((row, index) => index === 0 || row.company_id !== ranked[index - 1]?.company_id)).toBe(true);
  });

  test("softens the cap when only one company has supply", () => {
    const rows = Array.from({ length: 5 }, (_, index) => ({ id: `${index}`, company_id: "only" }));
    expect(diversifyRankedJobs(rows, 5)).toHaveLength(5);
  });
});
