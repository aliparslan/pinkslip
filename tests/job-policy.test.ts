import { describe, expect, test } from "bun:test";
import {
  isEvergreenPosting,
  isEvergreenTitle,
  isFreshPostedAt,
  MAX_POSTED_AGE_DAYS,
} from "../shared/job-policy";

describe("evergreen postings", () => {
  const now = new Date("2026-07-31T12:00:00.000Z").getTime();
  const aged = "2026-04-01T12:00:00.000Z";
  const recent = "2026-07-28T12:00:00.000Z";

  test("recognises standing-pipeline titles regardless of age", () => {
    expect(isEvergreenTitle("General Interest — Software Engineer")).toBe(true);
    expect(isEvergreenTitle("Talent Community")).toBe(true);
    expect(isEvergreenTitle("Expression of Interest, Research")).toBe(true);
    expect(isEvergreenTitle("Backend Engineer")).toBe(false);
  });

  test("treats an aged posting the board still lists as evergreen", () => {
    expect(isEvergreenPosting("Backend Engineer", aged, true, now)).toBe(true);
  });

  test("does not treat an aged posting the board dropped as evergreen", () => {
    // Removed from the board means filled or withdrawn. That must close rather
    // than become a permanent feed entry.
    expect(isEvergreenPosting("Backend Engineer", aged, false, now)).toBe(false);
  });

  test("leaves ordinary fresh postings alone", () => {
    expect(isEvergreenPosting("Backend Engineer", recent, true, now)).toBe(false);
  });
});

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
