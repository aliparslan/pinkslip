import { afterEach, describe, expect, it } from "bun:test";
import { api, apiFetch, configureApiClient } from "../packages/client/src/lib/api";

const originalFetch = globalThis.fetch;
const testGlobal = globalThis as typeof globalThis & { window?: Window & typeof globalThis };

afterEach(() => {
  globalThis.fetch = originalFetch;
  delete testGlobal.window;
  configureApiClient({
    baseUrl: "/api/v2",
    client: "web",
    getAccessToken: undefined,
    onAccessToken: undefined,
    onInvalidAccessToken: undefined,
  });
});

describe("native API token rotation", () => {
  it("routes protected image requests through the native API origin and bearer session", async () => {
    configureApiClient({
      baseUrl: "https://pinkslip.test/api/v2",
      client: "ios",
      getAccessToken: () => "native-session-token",
    });

    let requestedUrl = "";
    let requestedHeaders = new Headers();
    globalThis.fetch = async (input, init) => {
      requestedUrl = String(input);
      requestedHeaders = new Headers(init?.headers);
      return new Response(new Uint8Array([1, 2, 3]), {
        headers: { "content-type": "image/png" },
      });
    };

    const response = await apiFetch("/logo?domain=example.com", {
      headers: { Accept: "image/*" },
    });

    expect(response.ok).toBe(true);
    expect(requestedUrl).toBe("https://pinkslip.test/api/v2/logo?domain=example.com");
    expect(requestedHeaders.get("authorization")).toBe("Bearer native-session-token");
    expect(requestedHeaders.get("x-pinkslip-client")).toBe("ios");
  });

  it("does not replace a magic-link token when a stale guest request is rejected", async () => {
    testGlobal.window = globalThis as unknown as Window & typeof globalThis;

    let accessToken = "guest-token";
    let releaseStaleRequest!: () => void;
    let markStaleRequestStarted!: () => void;
    const staleRequestStarted = new Promise<void>((resolve) => {
      markStaleRequestStarted = resolve;
    });
    const staleRequestReleased = new Promise<void>((resolve) => {
      releaseStaleRequest = resolve;
    });
    const bootstrapTokens: Array<string | null> = [];
    const rejectedTokens: Array<string | null> = [];

    configureApiClient({
      baseUrl: "https://pinkslip.test/api/v2",
      client: "ios",
      getAccessToken: () => accessToken,
      onAccessToken: (token) => {
        accessToken = token;
      },
      onInvalidAccessToken: (rejectedToken) => {
        rejectedTokens.push(rejectedToken);
        if (!rejectedToken || rejectedToken === accessToken) accessToken = "replacement-guest-token";
      },
    });

    globalThis.fetch = async (input, init) => {
      const url = String(input);
      const token = new Headers(init?.headers).get("authorization")?.replace(/^Bearer\s+/i, "") ?? null;

      if (url.endsWith("/bootstrap")) {
        bootstrapTokens.push(token);
        if (token === "guest-token") {
          markStaleRequestStarted();
          await staleRequestReleased;
          return Response.json(
            { error: "Invalid token", code: "invalid_token" },
            { status: 401 }
          );
        }
        return Response.json({ me: {}, preferences: {} });
      }

      if (url.endsWith("/auth/email/verify")) {
        return Response.json({
          user: { id: "signed-in-user", name: "" },
          session: { state: "authenticated" },
          account: { authenticated: true, email: "person@example.com", providers: ["email"] },
          is_admin: false,
          native_token: "authenticated-token",
        });
      }

      throw new Error(`Unexpected request: ${url}`);
    };

    const staleBootstrap = api.bootstrap.get();
    await staleRequestStarted;
    await api.auth.verifyEmailToken("magic-link-token");
    releaseStaleRequest();
    await staleBootstrap;

    expect(rejectedTokens).toEqual(["guest-token"]);
    expect(bootstrapTokens).toEqual(["guest-token", "authenticated-token"]);
    expect(accessToken).toBe("authenticated-token");
  });
});
