import { describe, expect, test } from "bun:test";
import { createApiClient } from "../src/api";

function capture(body: unknown = { ok: true }, init: ResponseInit = {}) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, options?: RequestInit) => {
    calls.push({ url: String(input), init: options });
    return Response.json(body, init);
  }) as typeof fetch;
  return { calls, fetchImpl };
}

const sentHeaders = (call: { init?: RequestInit }) => new Headers(call.init?.headers);
const sentAuthorization = (call: { init?: RequestInit }) => sentHeaders(call).get("authorization");

describe("api client transport", () => {
  test("isolates base URL, client headers and bearer token per client", async () => {
    const first = capture();
    const second = capture();
    const ios = createApiClient({
      baseUrl: "https://one.test/api/v2/",
      client: "ios",
      build: "7",
      getAccessToken: () => "token-one",
      fetch: first.fetchImpl,
    });
    const web = createApiClient({
      baseUrl: "https://two.test/api/v2",
      getAccessToken: () => "token-two",
      fetch: second.fetchImpl,
    });

    await ios.bootstrap.get();
    await web.bootstrap.get();

    expect(first.calls[0].url).toBe("https://one.test/api/v2/bootstrap");
    expect(sentAuthorization(first.calls[0])).toBe("Bearer token-one");
    expect(sentHeaders(first.calls[0]).get("x-pinkslip-client")).toBe("ios");
    expect(sentHeaders(first.calls[0]).get("x-pinkslip-build")).toBe("7");

    expect(second.calls[0].url).toBe("https://two.test/api/v2/bootstrap");
    expect(sentAuthorization(second.calls[0])).toBe("Bearer token-two");
    expect(sentHeaders(second.calls[0]).get("x-pinkslip-client")).toBeNull();
  });

  test("recovers from an invalid token with that client's own rotation", async () => {
    let token = "stale";
    const seen: (string | null)[] = [];
    const fetchImpl = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      seen.push(new Headers(init?.headers).get("authorization"));
      if (seen.length === 1) return Response.json({ code: "invalid_token", error: "expired" }, { status: 401 });
      return Response.json({ ok: true });
    }) as typeof fetch;
    const client = createApiClient({
      fetch: fetchImpl,
      getAccessToken: () => token,
      onInvalidAccessToken: (rejected) => {
        expect(rejected).toBe("stale");
        token = "fresh";
      },
    });

    expect(await client.metrics.get()).toEqual({ ok: true });
    expect(seen).toEqual(["Bearer stale", "Bearer fresh"]);
  });

  test("delivers native_token responses through the owning client only", async () => {
    const rotated: string[] = [];
    const fetchImpl = (async () => Response.json({ native_token: "native-1", ok: true })) as typeof fetch;
    const client = createApiClient({
      fetch: fetchImpl,
      onAccessToken: (next) => {
        rotated.push(next);
      },
    });

    await client.bootstrap.get();
    expect(rotated).toEqual(["native-1"]);
  });

  test("returns undefined for 204 responses", async () => {
    const client = createApiClient({ fetch: (async () => new Response(null, { status: 204 })) as typeof fetch });
    expect(await client.auth.logout()).toBeUndefined();
  });

  test("omits the JSON content type for FormData bodies", async () => {
    const calls = capture();
    const client = createApiClient({ fetch: calls.fetchImpl });
    const body = new FormData();
    body.set("file", new Blob(["resume"]), "resume.pdf");

    await client.fetchApi("/resume-import/parse", { method: "POST", body });

    expect(sentHeaders(calls.calls[0]).get("content-type")).toBeNull();
  });

  test("sends resume uploads as multipart", async () => {
    const calls = capture({ profile: {} });
    const client = createApiClient({ fetch: calls.fetchImpl });

    await client.resumeImport.parse(new Blob(["%PDF-1.4"], { type: "application/pdf" }));

    const body = calls.calls[0].init?.body;
    expect(calls.calls[0].url).toBe("/api/v2/resume-import/parse");
    expect(body).toBeInstanceOf(FormData);
    const file = (body as FormData).get("file");
    expect(file).toBeInstanceOf(Blob);
    expect((file as Blob).type).toBe("application/pdf");
  });

  test("resolves relative paths against a normalized base", () => {
    expect(createApiClient().resolveUrl("/jobs")).toBe("/api/v2/jobs");
    expect(createApiClient().resolveUrl("jobs")).toBe("/api/v2/jobs");
    expect(createApiClient({ baseUrl: "https://api.test/v2/" }).resolveUrl("/jobs")).toBe("https://api.test/v2/jobs");
  });
});
