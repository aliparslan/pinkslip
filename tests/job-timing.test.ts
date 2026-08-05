import { describe, expect, test } from "bun:test";
import {
  jobOriginalTimingLabel,
  jobTimingLabel,
  type JobTimingInput,
} from "../frontend/src/lib/job-timing";

function job(overrides: Partial<JobTimingInput> = {}): JobTimingInput {
  return {
    posted_at: null,
    first_seen_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000 - 1_000).toISOString(),
    evergreen: 0,
    ...overrides,
  };
}

describe("job timing labels", () => {
  test("calls an undated listing discovered rather than detected", () => {
    expect(jobTimingLabel(job())).toBe("Discovered 2d ago");
  });

  test("keeps the original posting age visible for evergreen listings", () => {
    expect(jobTimingLabel(job({
      posted_at: new Date(Date.now() - 35 * 24 * 60 * 60 * 1000).toISOString(),
      evergreen: 1,
    }))).toBe("Evergreen · First posted 35d ago");
  });

  test("does not mislabel Greenhouse's update timestamp as a posting date", () => {
    expect(jobTimingLabel(job({
      posted_at: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(),
      source_type: "greenhouse",
    }))).toBe("Updated 4d ago");
  });

  test("adds discovery context for a Greenhouse update on job detail", () => {
    expect(jobOriginalTimingLabel(job({
      posted_at: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(),
      first_seen_at: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
      source_type: "greenhouse",
    }))).toBe("Discovered 10d ago");
  });

  test("does not duplicate timing for a source with a real post date", () => {
    expect(jobOriginalTimingLabel(job({
      posted_at: new Date().toISOString(),
      source_type: "ashby",
    }))).toBeNull();
  });
});
