import { describe, expect, test } from "bun:test";
import type { Application } from "../shared/application-stages";
import { byWeek, groupApplications, groupOf, trackerAge, trackerFacts } from "../apps/native/src/features/redesign/tracker-facts";

const now = new Date("2026-10-13T21:00:00Z");

const application = (patch: Partial<Application> = {}): Application => ({
  id: "a1",
  job_id: "j1",
  company_name: "Linear",
  title: "Product Engineer, Early Career",
  url: "https://linear.app/careers",
  stage: "applied",
  notes: "",
  applied_at: "2026-10-02T15:00:00Z",
  stage_changed_at: "2026-10-13T12:00:00Z",
  stage_date: null,
  created_at: "2026-10-01T15:00:00Z",
  updated_at: "2026-10-13T12:00:00Z",
  job: { location: "New York, NY", closed_at: null, company_domain: "linear.app" },
  ...patch,
});

describe("Tracker rows", () => {
  test("the time is minutes or hours within a day, then the date", () => {
    expect(trackerAge("2026-10-13T20:59:40Z", now)).toBe("now");
    expect(trackerAge("2026-10-13T20:48:00Z", now)).toBe("12m");
    expect(trackerAge("2026-10-13T12:00:00Z", now)).toBe("9h");
    expect(trackerAge("2026-10-11T12:00:00Z", now)).toBe("Oct 11");
    expect(trackerAge("2025-12-30T12:00:00Z", now)).toBe("Dec 30, 2025");
  });

  test("line three: where, then when you applied once it's past Applied; endings say how it ended", () => {
    expect(trackerFacts(application({ stage: "saved", applied_at: null }), now)).toBe("New York");
    expect(trackerFacts(application({ stage: "applied" }), now)).toBe("New York");
    expect(trackerFacts(application({ stage: "interview" }), now)).toBe("New York · applied Oct 2");
    expect(trackerFacts(application({ stage: "ghosted" }), now)).toBe("No reply");
    expect(trackerFacts(application({ stage: "rejected" }), now)).toBe("Rejected");
    expect(trackerFacts(application({ stage: "offer", job: null }), now)).toBe("applied Oct 2");
  });

  test("endings share Closed, and each stage leads with its latest move", () => {
    expect(groupOf("withdrawn")).toBe("closed");
    const groups = groupApplications([
      application({ id: "old", stage_changed_at: "2026-10-01T00:00:00Z" }),
      application({ id: "new", stage_changed_at: "2026-10-12T00:00:00Z" }),
      application({ id: "gone", stage: "rejected" }),
    ]);
    expect(groups.get("applied")?.map((row) => row.id)).toEqual(["new", "old"]);
    expect(groups.get("closed")?.map((row) => row.id)).toEqual(["gone"]);
    expect(groups.get("offer")).toEqual([]);
  });

  test("a stage on its own splits into this week and earlier", () => {
    const sections = byWeek([
      application({ id: "recent", stage_changed_at: "2026-10-12T00:00:00Z" }),
      application({ id: "older", stage_changed_at: "2026-09-20T00:00:00Z" }),
    ], now);
    expect(sections.map((section) => [section.title, section.applications.map((row) => row.id)])).toEqual([
      ["This week", ["recent"]],
      ["Earlier", ["older"]],
    ]);
  });
});
