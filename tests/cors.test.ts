import { describe, expect, it } from "bun:test";
import worker from "@worker/index";
import type { Env } from "@worker/types";

describe("native API CORS", () => {
  it("allows every header sent by the packaged iOS client", async () => {
    const response = await worker.fetch(
      new Request("https://pinkslip.work/api/v2/bootstrap", {
        method: "OPTIONS",
        headers: {
          Origin: "capacitor://localhost",
          "Access-Control-Request-Method": "GET",
          "Access-Control-Request-Headers": [
            "authorization",
            "content-type",
            "x-pinkslip-build",
            "x-pinkslip-client",
          ].join(","),
        },
      }),
      {} as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe("capacitor://localhost");
    const allowedHeaders = response.headers.get("access-control-allow-headers")?.toLowerCase() ?? "";
    expect(allowedHeaders).toContain("x-pinkslip-build");
    expect(allowedHeaders).toContain("x-pinkslip-client");
    expect(allowedHeaders).toContain("authorization");
  });
});

describe("legacy hostname redirect", () => {
  it("preserves the requested page and query on the new domain with a notice marker", async () => {
    const response = await worker.fetch(
      new Request("https://pinkslip.alip.dev/jobs/job_123?sort=recent", {
        headers: { Accept: "text/html" },
      }),
      {} as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(308);
    const destination = new URL(response.headers.get("location") ?? "");
    expect(destination.origin).toBe("https://pinkslip.work");
    expect(destination.pathname).toBe("/jobs/job_123");
    expect(destination.searchParams.get("sort")).toBe("recent");
    expect(destination.searchParams.get("ps_moved")).toBe("1");
  });

  it("preserves the static app shell CSP when a page falls through to assets", async () => {
    const shellPolicy = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'";
    const response = await worker.fetch(
      new Request("https://pinkslip.work/jobs/job_123?ps_moved=1", {
        headers: { Accept: "text/html" },
      }),
      {
        ASSETS: {
          fetch: async () => new Response("<html></html>", {
            headers: {
              "content-type": "text/html; charset=utf-8",
              "content-security-policy": shellPolicy,
            },
          }),
        },
      } as unknown as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-security-policy")).toBe(shellPolicy);
  });
});
