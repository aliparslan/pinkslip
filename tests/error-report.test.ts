import { describe, expect, it } from "bun:test";
import { buildErrorReport, createErrorReporter } from "../packages/core/src/error-report";

describe("createErrorReporter", () => {
  function harness() {
    const sent: unknown[] = [];
    let route = "/jobs/abc";
    const report = createErrorReporter({
      send: async (body) => { sent.push(JSON.parse(body)); },
      route: () => route,
      build: "1.3.5 (60)",
    });
    return { sent, report, go: (next: string) => { route = next; } };
  }

  it("sends each kind once per launch with the screen and build", () => {
    const { sent, report, go } = harness();
    report(new TypeError("x is not a function"));
    go("/today");
    report(new TypeError("x is not a function"));
    report("plain string failure");

    expect(sent).toEqual([
      expect.objectContaining({ name: "TypeError", message: "x is not a function", route: "/jobs/abc", build: "1.3.5 (60)" }),
      { name: "Error", message: "plain string failure", route: "/today", build: "1.3.5 (60)" },
    ]);
  });

  it("skips API answers and cancellations, and stops after ten", () => {
    const { sent, report } = harness();
    const apiError = Object.assign(new Error("Not found"), { name: "ApiError" });
    const abort = Object.assign(new Error("aborted"), { name: "AbortError" });
    report(apiError);
    report(abort);
    for (let index = 0; index < 12; index += 1) report(new Error(`fault ${index}`));
    expect(sent).toHaveLength(10);
  });

  it("never throws when sending fails", () => {
    const report = createErrorReporter({
      send: () => { throw new Error("offline"); },
      route: () => "/",
    });
    expect(() => report(new Error("boom"))).not.toThrow();
  });
});

describe("buildErrorReport", () => {
  it("returns nothing for an empty message", () => {
    expect(buildErrorReport(new Error(""), "/")).toBeNull();
  });
});
