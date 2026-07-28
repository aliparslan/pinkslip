import { describe, expect, test } from "bun:test";
import { isFreshPostedAt, MAX_POSTED_AGE_DAYS } from "../shared/job-policy";

describe("job freshness policy", () => {
  const now = new Date("2026-07-31T12:00:00.000Z").getTime();

  test("keeps day 29 and rejects day 30", () => {
    expect(MAX_POSTED_AGE_DAYS).toBe(29);
    expect(isFreshPostedAt("2026-07-02T12:00:01.000Z", now)).toBe(true);
    expect(isFreshPostedAt("2026-07-01T12:00:00.000Z", now)).toBe(false);
  });

  test("keeps undated jobs but rejects malformed dates", () => {
    expect(isFreshPostedAt(null, now)).toBe(true);
    expect(isFreshPostedAt("not-a-date", now)).toBe(false);
  });
});
