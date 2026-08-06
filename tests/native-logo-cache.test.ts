import { afterEach, describe, expect, test } from "bun:test";
import { configureApiClient } from "../packages/client/src/lib/api";
import {
  acquireNativeCompanyLogo,
  createNativeLogoCache,
  invalidateNativeCompanyLogo,
} from "../packages/client/src/lib/native-logo-cache";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  configureApiClient({
    baseUrl: "/api",
    client: "web",
    getAccessToken: undefined,
    onAccessToken: undefined,
    onInvalidAccessToken: undefined,
  });
});

describe("native logo cache", () => {
  test("deduplicates concurrent leases", async () => {
    const cache = createNativeLogoCache({ maxEntries: 2, revoke: () => undefined });
    let loads = 0;
    const load = async () => {
      loads += 1;
      return "blob:logo";
    };

    const first = cache.acquire("example.com", load);
    const second = cache.acquire("example.com", load);
    expect(await Promise.all([first.url, second.url])).toEqual(["blob:logo", "blob:logo"]);
    expect(loads).toBe(1);
    first.release();
    second.release();
  });

  test("shares one authenticated request across component leases", async () => {
    const domain = `shared-${crypto.randomUUID()}.example`;
    let requests = 0;
    configureApiClient({
      baseUrl: "https://pinkslip.test/api",
      client: "ios",
      getAccessToken: () => "native-session-token",
    });
    globalThis.fetch = (async () => {
      requests += 1;
      return new Response(new Uint8Array([1, 2, 3]), {
        headers: { "content-type": "image/png" },
      });
    }) as typeof fetch;

    const first = acquireNativeCompanyLogo(domain);
    const second = acquireNativeCompanyLogo(domain);
    const [firstUrl, secondUrl] = await Promise.all([first.url, second.url]);

    expect(requests).toBe(1);
    expect(firstUrl).toBe(secondUrl);
    expect(firstUrl?.startsWith("blob:")).toBe(true);
    first.release();
    second.release();
    invalidateNativeCompanyLogo(domain);
  });

  test("evicts only released entries and revokes their URLs", async () => {
    const revoked: string[] = [];
    const cache = createNativeLogoCache({ maxEntries: 1, revoke: (url) => revoked.push(url) });
    const first = cache.acquire("first.com", async () => "blob:first");
    expect(await first.url).toBe("blob:first");

    const second = cache.acquire("second.com", async () => "blob:second");
    expect(await second.url).toBe("blob:second");
    expect(cache.size).toBe(2);
    first.release();
    expect(cache.size).toBe(1);
    expect(revoked).toEqual(["blob:first"]);
    second.release();
  });

  test("removes failures so a later lease can retry", async () => {
    const cache = createNativeLogoCache({ revoke: () => undefined });
    const failed = cache.acquire("retry.com", async () => null);
    expect(await failed.url).toBeNull();
    failed.release();

    const retried = cache.acquire("retry.com", async () => "blob:retry");
    expect(await retried.url).toBe("blob:retry");
    retried.release();
  });

  test("does not let a stale request replace a newer retry", async () => {
    const revoked: string[] = [];
    let resolveFirst: (url: string) => void = () => undefined;
    const firstResult = new Promise<string>((resolve) => { resolveFirst = resolve; });
    const cache = createNativeLogoCache({ revoke: (url) => revoked.push(url) });

    const first = cache.acquire("race.com", () => firstResult);
    cache.invalidate("race.com");
    const retry = cache.acquire("race.com", async () => "blob:retry");
    resolveFirst("blob:stale");

    expect(await first.url).toBeNull();
    expect(await retry.url).toBe("blob:retry");
    expect(revoked).toEqual(["blob:stale"]);
    expect(cache.size).toBe(1);
    first.release();
    retry.release();
  });
});
