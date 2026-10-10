import { describe, expect, test } from "bun:test";
import { createSessionController } from "../apps/native/src/platform/session-controller";
import { appPathFor } from "../apps/native/src/platform/links";

const baseUrl = "https://api.example.test/api/v2";
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
};
const until = async (condition: () => boolean) => { for (let i = 0; !condition() && i < 100; i++) await Bun.sleep(1); expect(condition()).toBe(true); };

describe("native session lifecycle", () => {
  test("a failed first launch retries guest creation and concurrent starts share one mint", async () => {
    let calls = 0;
    let stored: string | null = null;
    const controller = createSessionController({ baseUrl, readToken: async () => null, writeToken: async (token) => { stored = token; },
      fetch: async () => { if (++calls === 1) throw new Error("Offline"); await Bun.sleep(10); return Response.json({ token: "guest" }); } });
    await expect(controller.initialize()).rejects.toThrow("Offline");
    const [a, b] = await Promise.all([controller.initialize(), controller.initialize()]);
    expect(a).toBe(b); expect(calls).toBe(2); expect<string | null>(stored).toBe("guest");
  });
  test("cold launch keeps a stored account token without minting a guest", async () => {
    const controller = createSessionController({ baseUrl, readToken: async () => "account", writeToken: async () => { throw new Error("No write needed"); },
      fetch: async (_url, init) => Response.json({ bearer: new Headers(init?.headers).get("authorization") }) });
    const api = await controller.initialize();
    expect(await api.me.get()).toMatchObject({ bearer: "Bearer account" });
  });
  test("keychain failure is reported and Retry persists the same token", async () => {
    let writes = 0;
    const controller = createSessionController({ baseUrl, readToken: async () => null,
      writeToken: async () => { if (++writes === 1) throw new Error("Keychain unavailable"); }, fetch: async () => Response.json({ token: "guest" }) });
    await expect(controller.initialize()).rejects.toThrow("Keychain unavailable");
    await controller.initialize();
    expect(writes).toBe(2); expect(controller.currentToken()).toBe("guest");
  });
  test("concurrent invalid-token responses share recovery, and a later sign-in wins", async () => {
    const guest = deferred<Response>();
    let mintCalls = 0;
    const stored: Array<string | null> = [];
    const controller = createSessionController({ baseUrl, readToken: async () => "expired", writeToken: async (token) => { stored.push(token); },
      fetch: async (input, init) => {
        const path = new URL(String(input)).pathname;
        if (path.endsWith("/native/session")) { mintCalls++; return guest.promise; }
        if (path.endsWith("/auth/email/verify")) return Response.json({ native_token: "signed-in" });
        const token = new Headers(init?.headers).get("authorization");
        return token === "Bearer expired" ? Response.json({ code: "invalid_token" }, { status: 401 }) : Response.json({ bearer: token });
      } });
    const api = await controller.initialize();
    const reads = Promise.all([api.me.get(), api.me.get()]);
    await until(() => mintCalls > 0);
    await api.auth.verifyEmailToken("link");
    guest.resolve(Response.json({ token: "obsolete-guest" }));
    expect<unknown>(await reads).toEqual([{ bearer: "Bearer signed-in" }, { bearer: "Bearer signed-in" }]);
    expect(mintCalls).toBe(1); expect(stored).toEqual([null, "signed-in"]);
  });
});

test("universal links and app links map only supported trusted URLs", () => {
  for (const url of ["https://pinkslip.work/jobs/abc", "pinkslip://jobs/abc", "pinkslip:///jobs/abc"]) expect(appPathFor(url)).toBe("/jobs/abc");
  expect(appPathFor("https://pinkslip.work/auth/email/verify?token=abc")).toBe("/auth/email/verify?token=abc");
  expect(appPathFor("/library?view=applied")).toBe("/library?view=applied");
  for (const url of ["https://evil.example/jobs/abc", "ftp://pinkslip.work/jobs/abc", "javascript:alert(1)", "/library-evil"]) expect(appPathFor(url)).toBeNull();
});
