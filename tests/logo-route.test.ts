import { afterEach, describe, expect, it, mock } from "bun:test";
import worker from "@worker/index";
import { curatedLogoKey } from "@worker/logo-shape";
import type { Env } from "@worker/types";

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

function bucket(objects: Record<string, Uint8Array>) {
  return {
    get: mock(async (key: string) => {
      const bytes = objects[key];
      if (!bytes) return null;
      return {
        body: new Blob([bytes]).stream(),
        arrayBuffer: async () => bytes.buffer,
      };
    }),
  } as unknown as R2Bucket;
}

function request(path: string, env: Partial<Env>) {
  return worker.fetch(
    new Request(`https://pinkslip.test${path}`),
    env as Env,
    { waitUntil() {}, passThroughOnException() {} } as unknown as ExecutionContext
  );
}

describe("company logo route", () => {
  it("files a logo under its bare domain", () => {
    expect(curatedLogoKey("www.artosai.com")).toBe("logos/artosai.com.png");
    expect(curatedLogoKey("artosai.com")).toBe("logos/artosai.com.png");
  });

  it("serves a hand-picked logo without asking Google", async () => {
    const fetchMock = mock(async () => new Response("favicon"));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const LOGO_BUCKET = bucket({ "logos/artosai.com.png": new Uint8Array([1, 2, 3]) });

    const response = await request("/api/v2/logo?domain=www.artosai.com", { LOGO_BUCKET });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("falls back to the favicon when there is no hand-picked logo", async () => {
    const fetchMock = mock(async () => new Response("favicon", {
      status: 200,
      headers: { "content-type": "image/png" },
    }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const response = await request("/api/v2/logo?domain=example.com", { LOGO_BUCKET: bucket({}) });

    expect(await response.text()).toBe("favicon");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("still works before the bucket exists", async () => {
    globalThis.fetch = mock(async () => new Response("favicon")) as unknown as typeof fetch;
    const response = await request("/api/v2/logo?domain=example.com", {});
    expect(await response.text()).toBe("favicon");
  });

  it("reports the shape of a hand-picked logo without asking Google", async () => {
    const fetchMock = mock(async () => new Response("favicon"));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const LOGO_BUCKET = bucket({ "logos/acme.com.png": new Uint8Array([1, 2, 3]) });

    const response = await request("/api/v2/logo/shape?domain=acme.com", { LOGO_BUCKET });

    const shape = await response.json() as { fills: boolean };
    expect(shape).toEqual({ fills: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
