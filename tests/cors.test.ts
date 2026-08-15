import { describe, expect, it } from "bun:test";
import worker from "@worker/index";
import type { Env } from "@worker/types";

describe("native API CORS", () => {
  it("allows every header sent by the packaged iOS client", async () => {
    const response = await worker.fetch(
      new Request("https://pinkslip.alip.dev/api/v2/bootstrap", {
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
