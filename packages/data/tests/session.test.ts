import { describe, expect, test } from "bun:test";
import { ApiError, type ApiClient, type MeResponse } from "@pinkslip/core/api";
import { createAppQueryClient } from "../src/query-client";
import { sessionQueryOptions } from "../src/session";

function apiWith(get: () => Promise<MeResponse>): ApiClient {
  return { me: { get } } as unknown as ApiClient;
}

const guest: MeResponse = { user: null, session: { state: "guest" }, account: null, is_admin: false };

describe("session query", () => {
  test("adopts the server's session state", async () => {
    const client = createAppQueryClient();
    expect(await client.fetchQuery(sessionQueryOptions(apiWith(async () => guest)))).toEqual({ state: "guest", me: guest });
  });

  test("a missing access code is locked, not anonymous", async () => {
    const client = createAppQueryClient();
    const api = apiWith(async () => { throw new ApiError("Access required", 401, "access_required"); });
    expect(await client.fetchQuery(sessionQueryOptions(api))).toEqual({ state: "locked", me: null });
  });

  test("any other 401 is anonymous", async () => {
    const client = createAppQueryClient();
    const api = apiWith(async () => { throw new ApiError("Unauthorized", 401, "unauthorized"); });
    expect(await client.fetchQuery(sessionQueryOptions(api))).toEqual({ state: "anonymous", me: null });
  });

  test("other failures stay errors", async () => {
    const client = createAppQueryClient({ defaultOptions: { queries: { retry: false } } });
    const api = apiWith(async () => { throw new ApiError("Down", 503, "network_unavailable"); });
    await expect(client.fetchQuery(sessionQueryOptions(api))).rejects.toThrow("Down");
  });
});
