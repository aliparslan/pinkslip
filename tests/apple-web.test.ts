import { afterEach, beforeAll, describe, expect, spyOn, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { Hono } from "hono";
import { authMiddleware } from "../worker/auth";
import { APPLE_WEB_CALLBACK, appleWebConfig, readAppleWebFlow, startAppleWebFlow } from "../worker/apple-web";
import { base64urlEncode } from "../worker/crypto";
import { decryptAppleRefreshToken, revokeAppleAuthorizationForUser } from "../worker/apple-oauth";
import authRoutes from "../worker/routes/auth";
import type { Env, Variables } from "../worker/types";
import { sqliteD1 } from "./sqlite-d1";

let signing: CryptoKeyPair;
let clientPem: string;
let publicKey: JsonWebKey;
const databases: ReturnType<typeof sqliteD1>["sqlite"][] = [];
let fetchMock: ReturnType<typeof spyOn<typeof globalThis, "fetch">> | undefined;
beforeAll(async () => {
  signing = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", hash: "SHA-256", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]) }, true, ["sign", "verify"]) as CryptoKeyPair;
  publicKey = await crypto.subtle.exportKey("jwk", signing.publicKey) as JsonWebKey;
  const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]) as CryptoKeyPair;
  const der = new Uint8Array(await crypto.subtle.exportKey("pkcs8", pair.privateKey) as ArrayBuffer);
  clientPem = `-----BEGIN PRIVATE KEY-----\n${btoa(String.fromCharCode(...der))}\n-----END PRIVATE KEY-----`;
});
afterEach(() => { fetchMock?.mockRestore(); for (const db of databases.splice(0)) db.close(); });

async function jwt(payload: Record<string, unknown>) {
  const head = base64urlEncode(new TextEncoder().encode(JSON.stringify({ alg: "RS256", kid: "pinkslip-web-test" })));
  const body = base64urlEncode(new TextEncoder().encode(JSON.stringify({ iss: "https://appleid.apple.com", exp: Math.floor(Date.now() / 1000) + 300, aud: "dev.alip.pinkslip.web", sub: "apple-person", email: "relay@example.test", email_verified: true, ...payload })));
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", signing.privateKey, new TextEncoder().encode(`${head}.${body}`));
  return `${head}.${body}.${base64urlEncode(new Uint8Array(signature))}`;
}

function setup() {
  const { sqlite, db } = sqliteD1();
  databases.push(sqlite);
  // Exercise account linking and guest merges against the actual schema.
  const migrations = resolve(import.meta.dir, "../migrations");
  for (const name of readdirSync(migrations).filter((name) => name.endsWith(".sql")).sort()) {
    sqlite.exec(readFileSync(resolve(migrations, name), "utf8"));
  }
  sqlite.exec("PRAGMA foreign_keys = ON");
  sqlite.run("INSERT INTO users(id) VALUES ('guest')");
  const now = new Date().toISOString();
  sqlite.run("INSERT INTO auth_sessions(id, user_id, state, created_at, expires_at, last_seen_at) VALUES ('guest-session', 'guest', 'guest', ?, ?, ?)", [now, new Date(Date.now() + 600_000).toISOString(), now]);
  const env = { DB: db, APPLE_APP_ID: "dev.alip.pinkslip", APPLE_TEAM_ID: "TEAM123456", APPLE_WEB_CLIENT_ID: "dev.alip.pinkslip.web",
    APPLE_SIGN_IN_KEY_ID: "KEY1234567", APPLE_SIGN_IN_PRIVATE_KEY: clientPem,
    APPLE_TOKEN_ENCRYPTION_KEY: base64urlEncode(new Uint8Array(32).fill(7)) } as Env;
  const app = new Hono<{ Bindings: Env; Variables: Variables }>();
  app.use("/api/v2/*", authMiddleware);
  app.route("/api/v2/auth", authRoutes);
  const start = (origin = "https://pinkslip.work") => app.fetch(new Request("https://pinkslip.work/api/v2/auth/apple/web/start", {
    method: "POST", headers: { origin, cookie: "psid=guest-session" },
  }), env);
  const callback = (cookie: string, form: URLSearchParams) => app.fetch(new Request("https://pinkslip.work" + APPLE_WEB_CALLBACK, {
    method: "POST", headers: { cookie, "content-type": "application/x-www-form-urlencoded", origin: "https://appleid.apple.com" }, body: form.toString(),
  }), env);
  return { sqlite, db, env, start, callback };
}

async function flow(context: ReturnType<typeof setup>) {
  const response = await context.start();
  expect(response.status).toBe(303);
  const authorize = new URL(response.headers.get("location")!);
  const cookie = response.headers.getSetCookie().find((value) => value.startsWith("__Host-psapple="))!.split(";")[0]!;
  return { authorize, cookie, state: authorize.searchParams.get("state")!, nonce: authorize.searchParams.get("nonce")! };
}

function mockApple(idToken: string) {
  let exchanges = 0;
  const requests: URLSearchParams[] = [];
  const mockFetch: (...args: Parameters<typeof fetch>) => ReturnType<typeof fetch> = async (input, init) => {
    if (String(input).endsWith("/auth/keys")) return Response.json({ keys: [{ ...publicKey, alg: "RS256", kid: "pinkslip-web-test", use: "sig" }] });
    if (String(input).endsWith("/auth/token")) {
      requests.push(new URLSearchParams(String(init?.body)));
      if (++exchanges > 1) return Response.json({ error: "invalid_grant" }, { status: 400 });
      return Response.json({ access_token: "access", token_type: "Bearer", expires_in: 3600, refresh_token: "refresh", id_token: idToken });
    }
    if (String(input).endsWith("/auth/revoke")) { requests.push(new URLSearchParams(String(init?.body))); return new Response(null, { status: 200 }); }
    throw new Error("Unexpected network request");
  };
  fetchMock = spyOn(globalThis, "fetch").mockImplementation(mockFetch as typeof fetch);
  return requests;
}

describe("website Apple sign-in", () => {
  test("is unavailable without the website Services ID and all server credentials", () => {
    expect(appleWebConfig({ APPLE_APP_ID: "dev.alip.pinkslip" } as Env)).toBeNull();
    expect(appleWebConfig({ APPLE_WEB_CLIENT_ID: "dev.alip.pinkslip.web" } as Env)).toBeNull();
  });
  test("start binds the login to a secure expiring browser cookie and canonical callback", async () => {
    const current = setup();
    const { authorize, cookie, state } = await flow(current);
    expect(authorize.origin).toBe("https://appleid.apple.com");
    expect(authorize.searchParams.get("client_id")).toBe("dev.alip.pinkslip.web");
    expect(authorize.searchParams.get("response_mode")).toBe("form_post");
    expect(authorize.searchParams.get("redirect_uri")).toBe("https://pinkslip.work" + APPLE_WEB_CALLBACK);
    expect(cookie).not.toContain("guest-session");
    expect((await readAppleWebFlow(current.env, cookie, state, "https://pinkslip.work")).sessionId).toBe("guest-session");
    expect((await current.start("https://evil.example")).status).toBe(403);
    await expect(startAppleWebFlow(current.env, "guest-session", "https://evil.example", null)).rejects.toThrow();
  });
  test("missing, altered or cross-origin state cannot sign in", async () => {
    const current = setup();
    const { cookie, state } = await flow(current);
    for (const [candidateCookie, candidateState] of [["", state], [cookie, "wrong"], [cookie.replace(/.$/, "!"), state]]) {
      const response = await current.callback(candidateCookie!, new URLSearchParams({ state: candidateState!, code: "code" }));
      expect(response.headers.get("location")).toBe("/you/account?apple=error");
    }
    await expect(readAppleWebFlow(current.env, cookie, state, "https://pinkslip.alip.dev")).rejects.toThrow();
    expect(current.sqlite.query("SELECT * FROM auth_identities").all()).toHaveLength(0);
  });
  test("cancel returns to Account, and a revoked guest flow cannot finish", async () => {
    const current = setup();
    const { cookie, state } = await flow(current);
    const form = new URLSearchParams({ state, error: "user_cancelled_authorize" });
    expect((await current.callback(cookie, form)).headers.get("location")).toBe("/you/account?apple=cancelled");
    current.sqlite.run("UPDATE auth_sessions SET revoked_at = datetime('now') WHERE id = 'guest-session'");
    expect((await current.callback(cookie, form)).headers.get("location")).toBe("/you/account?apple=error");
  });
  test("signs in, rotates the cookie, stores the web token's audience and revokes with that client", async () => {
    const current = setup();
    const { cookie, state, nonce } = await flow(current);
    const token = await jwt({ nonce });
    const requests = mockApple(token);
    const form = new URLSearchParams({ state, code: "one-time", id_token: token, user: JSON.stringify({ email: "attacker@example.test", name: { firstName: "Avery" } }) });
    const response = await current.callback(cookie, form);
    expect(response.headers.get("location")).toBe("/you/account?apple=success");
    expect(response.headers.getSetCookie().some((value) => value.startsWith("psid=") && value.includes("HttpOnly"))).toBe(true);
    expect(requests[0]?.get("redirect_uri")).toBe("https://pinkslip.work" + APPLE_WEB_CALLBACK);
    const identity = current.sqlite.query("SELECT user_id, email FROM auth_identities").get();
    expect(identity).toEqual({ user_id: "guest", email: "relay@example.test" });
    const stored = current.sqlite.query("SELECT identity_id, encrypted_token FROM apple_refresh_tokens").get() as { identity_id: string; encrypted_token: string };
    expect(JSON.parse(await decryptAppleRefreshToken(stored.encrypted_token, stored.identity_id, current.env.APPLE_TOKEN_ENCRYPTION_KEY!))).toEqual({ refreshToken: "refresh", clientId: "dev.alip.pinkslip.web" });
    expect(await revokeAppleAuthorizationForUser(current.env, "guest")).toBe("revoked");
    expect(requests.at(-1)?.get("client_id")).toBe("dev.alip.pinkslip.web");
    expect((await current.callback(cookie, form)).headers.get("location")).toBe("/you/account?apple=error");
  });
  test("joins the existing native Apple identity and carries guest saved jobs", async () => {
    const current = setup();
    current.sqlite.run("INSERT INTO users(id, role) VALUES ('account', 'admin')");
    current.sqlite.run("INSERT INTO auth_identities(id, user_id, provider, provider_subject) VALUES ('native-identity', 'account', 'apple', 'apple-person')");
    current.sqlite.run("INSERT INTO companies(id, name, ats_type, ats_slug) VALUES ('fixture-company', 'Fixture', 'greenhouse', 'fixture')");
    current.sqlite.run("INSERT INTO jobs(id, company_id, external_id, title, url) VALUES ('saved-job', 'fixture-company', 'fixture', 'Engineer', 'https://example.test/job')");
    current.sqlite.run("INSERT INTO saved_jobs(user_id, job_id) VALUES ('guest', 'saved-job')");
    const { cookie, state, nonce } = await flow(current);
    const token = await jwt({ nonce });
    mockApple(token);
    expect((await current.callback(cookie, new URLSearchParams({ state, code: "code", id_token: token }))).headers.get("location")).toBe("/you/account?apple=success");
    expect(current.sqlite.query("SELECT user_id FROM saved_jobs WHERE job_id = 'saved-job'").all()).toEqual([{ user_id: "account" }]);
    expect(current.sqlite.query("SELECT role FROM users WHERE id = 'account'").get()).toEqual({ role: "admin" });
    expect(current.sqlite.query("SELECT * FROM users WHERE id = 'guest'").get()).toBeNull();
  });
  test("rejects wrong nonce, native audience and a mismatched code exchange", async () => {
    for (const change of [{ nonce: "wrong" }, { aud: "dev.alip.pinkslip" }, { sub: "different-person" }]) {
      const current = setup();
      const { cookie, state, nonce } = await flow(current);
      const token = await jwt({ nonce, ...(change.sub ? {} : change) });
      mockApple(await jwt({ nonce, ...change }));
      const response = await current.callback(cookie, new URLSearchParams({ state, code: "code", id_token: token }));
      expect(response.headers.get("location")).toBe("/you/account?apple=error");
      expect(current.sqlite.query("SELECT * FROM auth_identities").all()).toHaveLength(0);
      fetchMock?.mockRestore();
    }
  });
  test("an expired flow is rejected before any token exchange", async () => {
    const current = setup();
    const { cookie, state } = await flow(current);
    const now = Date.now();
    const clock = spyOn(Date, "now").mockReturnValue(now + 601_000);
    try { await expect(readAppleWebFlow(current.env, cookie, state, "https://pinkslip.work")).rejects.toThrow(); }
    finally { clock.mockRestore(); }
  });
  test("an unverified Apple email cannot take over an existing email account", async () => {
    const current = setup();
    current.sqlite.run("INSERT INTO users(id) VALUES ('email-account')");
    current.sqlite.run("INSERT INTO auth_identities(id, user_id, provider, provider_subject, email, email_verified) VALUES ('email-identity', 'email-account', 'email', 'relay@example.test', 'relay@example.test', 1)");
    const { cookie, state, nonce } = await flow(current);
    const token = await jwt({ nonce, email_verified: false });
    mockApple(token);
    expect((await current.callback(cookie, new URLSearchParams({ state, code: "code", id_token: token }))).headers.get("location")).toBe("/you/account?apple=success");
    expect(current.sqlite.query("SELECT user_id FROM auth_identities WHERE provider = 'apple'").get()).toEqual({ user_id: "guest" });
    expect(current.sqlite.query("SELECT * FROM users WHERE id = 'email-account'").get()).toBeTruthy();
  });
});
