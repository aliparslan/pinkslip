import { describe, expect, test } from "bun:test";
import { availableRoles, feedParams, filterCount, withoutRefinements } from "../packages/core/src/feed-criteria";

describe("the Role chip", () => {
  test("offers only the roles in the saved search, in display order", () => {
    expect(availableRoles(["backend", "software_engineering", "security"])).toEqual(["software_engineering", "backend", "security"]);
  });

  test("shows forward-deployed roles as SWE, once", () => {
    expect(availableRoles(["software_engineering", "forward_deployed"])).toEqual(["software_engineering"]);
    expect(availableRoles(["forward_deployed"])).toEqual(["software_engineering"]);
  });

  test("offers nothing before the search has loaded", () => {
    expect(availableRoles(undefined)).toEqual([]);
  });

  test("asks the server for that one role, and for forward-deployed with SWE", () => {
    expect(feedParams({ role: "backend" }, [], []).roles).toBe("backend");
    expect(feedParams({ role: "software_engineering" }, [], []).roles).toBe("software_engineering,forward_deployed");
  });

  test("leaves the list alone until a role is picked", () => {
    expect(feedParams({}, [], [])).not.toHaveProperty("roles");
  });

  test("counts as a filter, and Clear filters drops it", () => {
    expect(filterCount({ role: "backend" }, [], [])).toBe(1);
    expect(withoutRefinements({ role: "backend" })).not.toHaveProperty("role");
  });
});
