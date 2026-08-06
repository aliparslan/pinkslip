import { afterEach, describe, expect, it } from "bun:test";
import { api, configureApiClient } from "../packages/client/src/lib/api";

const originalFetch = globalThis.fetch;
const testGlobal = globalThis as typeof globalThis & { window?: Window & typeof globalThis };

afterEach(() => {
  globalThis.fetch = originalFetch;
  delete testGlobal.window;
  configureApiClient({
    baseUrl: "/api",
    client: "web",
    getAccessToken: undefined,
    onAccessToken: undefined,
    onInvalidAccessToken: undefined,
  });
});

describe("native API token rotation", () => {
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
      baseUrl: "https://pinkslip.test/api",
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
