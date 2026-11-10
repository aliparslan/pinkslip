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

describe("pages on localhost", () => {
  const allowed = async (api: string) => (await worker.fetch(
    new Request(`${api}/api/v2/bootstrap`, { method: "OPTIONS", headers: { Origin: "http://localhost:5173", "Access-Control-Request-Method": "GET" } }),
    {} as Env,
    {} as ExecutionContext,
  )).headers.get("access-control-allow-origin");

  it("can call the API while it runs locally", async () => {
    expect(await allowed("http://localhost:8787")).toBe("http://localhost:5173");
    expect(await allowed("http://127.0.0.1:8787")).toBe("http://localhost:5173");
  });

  it("can't call the live one", async () => {
    expect(await allowed("https://pinkslip.work")).toBeNull();
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
});
