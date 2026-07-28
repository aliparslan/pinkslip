import { describe, expect, test } from "bun:test";
import {
  normalizeRoute,
  rootDestinationFor,
  routeDefinition,
  routeDepth,
  routeParam,
  routeShell,
  showsRootNavigation,
} from "../frontend/src/route-config";

describe("frontend route configuration", () => {
  test("normalizes legacy links without dropping query parameters", () => {
    expect(normalizeRoute("/my-jobs/applied?from=email")).toBe("/library/applied?from=email");
    expect(normalizeRoute("/profile")).toBe("/you");
    expect(normalizeRoute("/you/operations")).toBe("/admin");
  });

  test("matches dynamic job routes and extracts parameters", () => {
    expect(routeDefinition("/jobs/job_123?source=push").id).toBe("job");
    expect(routeParam("/jobs/job_123?source=push", "jobId")).toBe("job_123");
    expect(routeParam("/you/preferences", "jobId")).toBeNull();
  });

  test("keeps consumer and admin navigation separate", () => {
    expect(routeShell("/admin/inbox")).toBe("admin");
    expect(rootDestinationFor("/admin/inbox")).toBe("you");
    expect(routeDepth("/admin/inbox")).toBe(1);
    expect(rootDestinationFor("/library/saved")).toBe("library");
    expect(showsRootNavigation("/library/applied")).toBeTrue();
    expect(showsRootNavigation("/jobs/job_123")).toBeFalse();
  });
});
