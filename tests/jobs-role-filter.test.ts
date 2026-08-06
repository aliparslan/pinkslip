import { describe, expect, it } from "bun:test";
import { parseRoleFilter } from "@worker/routes/jobs";

describe("parseRoleFilter", () => {
  it("preserves the unfiltered feed when the parameter is absent", () => {
    expect(parseRoleFilter(undefined)).toBeUndefined();
  });

  it("accepts, trims, and de-duplicates known roles", () => {
    expect(parseRoleFilter("frontend, forward_deployed,frontend")).toEqual([
      "frontend",
      "forward_deployed",
    ]);
  });

  it("rejects empty and unknown role filters rather than widening the feed", () => {
    expect(parseRoleFilter("")).toBeNull();
    expect(parseRoleFilter("frontend,not_a_role")).toBeNull();
  });
});
