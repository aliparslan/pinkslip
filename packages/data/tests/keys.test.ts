import { describe, expect, test } from "bun:test";
import { queryKeys } from "../src/keys";

describe("query keys", () => {
  test("separates public and personal reads", () => {
    expect(queryKeys.public.jobs()[0]).toBe("public");
    expect(queryKeys.public.job("job-1")[0]).toBe("public");
    expect(queryKeys.personal.saved()[0]).toBe("personal");
    expect(queryKeys.personal.applied()[0]).toBe("personal");
    expect(queryKeys.personal.root).toEqual(["personal"]);
    expect(queryKeys.session()).toEqual(["session"]);
  });

  test("keeps the discovery list prefix stable for cache updates", () => {
    expect(queryKeys.personal.jobs({ limit: "20" }).slice(0, 2)).toEqual(["personal", "jobs"]);
    expect(queryKeys.personal.jobsRoot).toEqual(["personal", "jobs"]);
    expect(queryKeys.personal.job("job-1").slice(0, 2)).toEqual(["personal", "job"]);
  });
});
