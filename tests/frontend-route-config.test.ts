import { describe, expect, test } from "bun:test";
import {
  initialRouteForLocation,
  initialHistoryRouteForLocation,
  documentTitleFor,
  normalizeRoute,
  rootDestinationFor,
  routeDefinition,
  routeDepth,
  routeParam,
  routeShell,
  showsRootNavigation,
} from "../packages/client/src/route-config";

describe("frontend route configuration", () => {
  test("normalizes legacy links without dropping query parameters", () => {
    expect(normalizeRoute("/my-jobs/applied?from=email")).toBe("/library/applied?from=email");
    expect(normalizeRoute("/profile")).toBe("/you");
    expect(normalizeRoute("/you/operations")).toBe("/admin");
    expect(normalizeRoute("you/preferences/")).toBe("/you/preferences");
  });

  test("opens direct notification and shared-link paths in the client router", () => {
    expect(initialRouteForLocation("", "/jobs/job_123")).toBe("/jobs/job_123");
    expect(initialRouteForLocation("#/library/applied", "/jobs/job_123")).toBe("/library/applied");
    expect(initialRouteForLocation("", "/library")).toBe("/library/saved");
  });

  test("migrates legacy web hashes to clean routes and preserves both query locations", () => {
    expect(initialHistoryRouteForLocation("#/settings", "/", "?auth=email-success"))
      .toBe("/you?auth=email-success");
    expect(initialHistoryRouteForLocation("#/jobs/job_123?from=library-saved", "/", "?source=email"))
      .toBe("/jobs/job_123?source=email&from=library-saved");
    expect(initialHistoryRouteForLocation("#section", "/you/resume", "?mode=edit"))
      .toBe("/you/resume?mode=edit");
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

  test("gives every admin subsection a specific document title", () => {
    expect(documentTitleFor("/admin")).toBe("Admin · Manage");
    expect(documentTitleFor("/admin/inbox")).toBe("Admin · Inbox");
    expect(documentTitleFor("/admin/sources")).toBe("Admin · Sources");
    expect(documentTitleFor("/admin/runs")).toBe("Admin · Runs");
    expect(documentTitleFor("/you")).toBeNull();
  });

  test("distinguishes saved and applied Library document titles", () => {
    expect(documentTitleFor("/library/saved")).toBe("Library · Saved");
    expect(documentTitleFor("/library/applied")).toBe("Library · Applied");
  });
});
