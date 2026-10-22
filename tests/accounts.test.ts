import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { createGuestSession } from "@worker/auth";
import { base64urlEncode } from "@worker/crypto";
import { _resetGoogleKeyCache } from "@worker/google";
import worker from "@worker/index";
import { hashPassword, PASSWORD_ITERATIONS, verifyPassword, WORKERS_PBKDF2_MAX_ITERATIONS } from "@worker/passwords";
import type { Env } from "@worker/types";
import { sqliteD1 } from "./sqlite-d1";

const migrationsDir = new URL("../migrations/", import.meta.url).pathname;
const databases: Database[] = [];
const realFetch = globalThis.fetch;
afterEach(() => {
  for (const db of databases.splice(0)) db.close();
  globalThis.fetch = realFetch;
  _resetGoogleKeyCache();
});

const ORIGIN = "https://pinkslip.work";

function setup() {
  const { sqlite, db } = sqliteD1();
  databases.push(sqlite);
  for (const file of readdirSync(migrationsDir).filter((name) => name.endsWith(".sql")).sort()) {
    sqlite.exec(readFileSync(`${migrationsDir}${file}`, "utf8"));
  }
  sqlite.exec("PRAGMA foreign_keys = ON");
  const mail: Array<{ to: string; subject: string; text?: string }> = [];
  const env = {
    DB: db,
    EMAIL: { send: async (message: { to: string; subject: string; text?: string }) => { mail.push(message); } },
    EMAIL_FROM_ADDRESS: "login@pinkslip.work",
    GOOGLE_CLIENT_ID: "google-client",
    GOOGLE_CLIENT_SECRET: "google-secret",
  } as unknown as Env;
  const ctx = { waitUntil() {}, passThroughOnException() {} } as unknown as ExecutionContext;
  /** Calls the API as the iPhone app does, with its bearer session. */
  const app = (token: string) => (path: string, body?: unknown, method = "POST") => worker.fetch(new Request(`${ORIGIN}${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json", "x-pinkslip-client": "ios" },
    body: body === undefined ? undefined : JSON.stringify(body),
  }), env, ctx);
  const lastCode = () => mail.at(-1)?.text?.match(/code is (\d{6})/)?.[1] ?? "";
  return { sqlite, db, env, ctx, mail, app, lastCode };
}

async function guest(db: D1Database) {
  return (await createGuestSession(db)).id;
}

describe("passwords", () => {
  it("stay within what Cloudflare Workers' PBKDF2 accepts", () => {
    // Workers refuse more than 100,000 iterations; Bun doesn't, so only this catches it.
    expect(PASSWORD_ITERATIONS).toBeLessThanOrEqual(WORKERS_PBKDF2_MAX_ITERATIONS);
    expect(WORKERS_PBKDF2_MAX_ITERATIONS).toBe(100_000);
  });

  it("are stored as salted one-way hashes and checked exactly", async () => {
    const hash = await hashPassword("correct horse", 1000);
    expect(hash).toMatch(/^pbkdf2-sha256\$1000\$[\w-]+\$[\w-]+$/);
    expect(hash).not.toContain("correct horse");
    expect(await hashPassword("correct horse", 1000)).not.toBe(hash);
    expect(await verifyPassword("correct horse", hash)).toBe(true);
    expect(await verifyPassword("correct horsf", hash)).toBe(false);
    expect(await verifyPassword("anything", null)).toBe(false);
  });
});

describe("email and password", () => {
  it("signs up with a code and a password, then signs in with the password", async () => {
    const { db, app, mail, lastCode } = setup();
    const call = app(await guest(db));
    expect((await call("/api/v2/auth/email/code/start", { email: "Alex@Example.com" })).status).toBe(200);
    expect(mail[0]).toMatchObject({ to: "alex@example.com", subject: expect.stringContaining("Your Pinkslip code") });

    const signedUp = await call("/api/v2/auth/email/code/verify", { email: "alex@example.com", code: lastCode(), password: "hunter2hunter2" });
    expect(signedUp.status).toBe(200);
    const account = await signedUp.json() as { session: { state: string }; account: { providers: string[]; has_password: boolean }; native_token: string };
    expect(account).toMatchObject({ session: { state: "authenticated" }, account: { providers: ["email"], has_password: true } });
    expect(account.native_token).toBeString();

    const fresh = app(await guest(db));
    expect((await fresh("/api/v2/auth/password/login", { email: "alex@example.com", password: "wrong-password" })).status).toBe(401);
    const signedIn = await fresh("/api/v2/auth/password/login", { email: "ALEX@example.com", password: "hunter2hunter2" });
    expect(signedIn.status).toBe(200);
    expect(await signedIn.json()).toMatchObject({ session: { state: "authenticated" }, account: { email: "alex@example.com" } });
  });

  it("asks for a longer password and the right code", async () => {
    const { db, app, lastCode } = setup();
    const call = app(await guest(db));
    await call("/api/v2/auth/email/code/start", { email: "alex@example.com" });
    expect((await call("/api/v2/auth/email/code/verify", { email: "alex@example.com", code: lastCode(), password: "short" })).status).toBe(400);
    expect((await call("/api/v2/auth/email/code/verify", { email: "alex@example.com", code: "000000" === lastCode() ? "111111" : "000000" })).status).toBe(401);
  });

  it("gives up on a code after five wrong tries", async () => {
    const { db, app, lastCode } = setup();
    const call = app(await guest(db));
    await call("/api/v2/auth/email/code/start", { email: "alex@example.com" });
    const right = lastCode();
    const wrong = right === "123456" ? "654321" : "123456";
    for (let index = 0; index < 5; index += 1) await call("/api/v2/auth/email/code/verify", { email: "alex@example.com", code: wrong });
    const response = await call("/api/v2/auth/email/code/verify", { email: "alex@example.com", code: right });
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ code: "expired_code" });
  });

  it("resets a forgotten password with a code", async () => {
    const { sqlite, db, app, lastCode } = setup();
    const first = app(await guest(db));
    await first("/api/v2/auth/email/code/start", { email: "alex@example.com" });
    await first("/api/v2/auth/email/code/verify", { email: "alex@example.com", code: lastCode(), password: "old-password-1" });

    // The send limit allows one code a minute: move the first one back.
    sqlite.run("UPDATE email_login_tokens SET created_at = ?", [new Date(Date.now() - 5 * 60_000).toISOString()]);
    const later = app(await guest(db));
    await later("/api/v2/auth/email/code/start", { email: "alex@example.com" });
    expect((await later("/api/v2/auth/email/code/verify", { email: "alex@example.com", code: lastCode(), password: "new-password-2" })).status).toBe(200);

    const check = app(await guest(db));
    expect((await check("/api/v2/auth/password/login", { email: "alex@example.com", password: "old-password-1" })).status).toBe(401);
    expect((await check("/api/v2/auth/password/login", { email: "alex@example.com", password: "new-password-2" })).status).toBe(200);
  });

  it("makes a password right after signing in with a code, and only then", async () => {
    const { sqlite, db, app, lastCode } = setup();
    await app(await guest(db))("/api/v2/auth/email/code/start", { email: "alex@example.com" });
    const first = await app(await guest(db))("/api/v2/auth/email/code/verify", { email: "alex@example.com", code: lastCode() });
    const { native_token: token, account } = await first.json() as { native_token: string; account: { has_password: boolean } };
    expect(account.has_password).toBe(false);
    const signedIn = app(token);

    expect((await signedIn("/api/v2/auth/password", { password: "short" })).status).toBe(400);
    const made = await signedIn("/api/v2/auth/password", { password: "hunter2hunter2" });
    expect(made.status).toBe(200);
    expect(await made.json()).toMatchObject({ account: { has_password: true } });
    expect((await app(await guest(db))("/api/v2/auth/password/login", { email: "alex@example.com", password: "hunter2hunter2" })).status).toBe(200);

    // A quarter of an hour later the code no longer vouches for the session.
    const earlier = new Date(Date.now() - 20 * 60_000).toISOString();
    sqlite.run("UPDATE email_login_tokens SET consumed_at = ?", [earlier]);
    sqlite.run("UPDATE auth_sessions SET created_at = ?", [earlier]);
    expect((await signedIn("/api/v2/auth/password", { password: "another-one-2" })).status).toBe(403);
    // A guest can't set one at all.
    expect((await app(await guest(db))("/api/v2/auth/password", { password: "another-one-2" })).status).toBe(401);
  });

  it("pauses an email after ten wrong passwords", async () => {
    const { db, app } = setup();
    const call = app(await guest(db));
    for (let index = 0; index < 10; index += 1) {
      expect((await call("/api/v2/auth/password/login", { email: "alex@example.com", password: `nope-${index}-nope` })).status).toBe(401);
    }
    expect((await call("/api/v2/auth/password/login", { email: "alex@example.com", password: "whatever-it-is" })).status).toBe(429);
  });
});

describe("one person, one account", () => {
  it("joins an account its verified email is already on, bringing the guest's saves", async () => {
    const { sqlite, db, app, lastCode } = setup();
    sqlite.run("INSERT INTO users (id) VALUES ('existing')");
    sqlite.run(`INSERT INTO auth_identities (id, user_id, provider, provider_subject, email, email_verified)
      VALUES ('apple-id', 'existing', 'apple', 'apple-sub', 'alex@icloud.com', 1)`);
    const token = await guest(db);
    const guestUser = (sqlite.query("SELECT user_id FROM auth_sessions WHERE id = ?").get(token) as { user_id: string }).user_id;
    sqlite.run("INSERT INTO user_preferences (user_id, key, value) VALUES (?, 'theme', 'dark')", [guestUser]);
    const call = app(token);
    await call("/api/v2/auth/email/code/start", { email: "alex@icloud.com" });
    const response = await call("/api/v2/auth/email/code/verify", { email: "alex@icloud.com", code: lastCode() });

    expect(await response.json()).toMatchObject({ user: { id: "existing" }, account: { providers: ["apple", "email"] } });
    expect(sqlite.query("SELECT value FROM user_preferences WHERE user_id = 'existing' AND key = 'theme'").get()).toEqual({ value: "dark" });
  });

  it("keeps a Hide my email address and an unverified email apart", async () => {
    const { sqlite, db, app, lastCode } = setup();
    sqlite.run("INSERT INTO users (id) VALUES ('relay'), ('unverified')");
    sqlite.run(`INSERT INTO auth_identities (id, user_id, provider, provider_subject, email, email_verified)
      VALUES ('a', 'relay', 'apple', 'apple-sub', 'x7f@privaterelay.appleid.com', 1),
             ('b', 'unverified', 'apple', 'apple-sub-2', 'sam@example.com', 0)`);
    const call = app(await guest(db));
    await call("/api/v2/auth/email/code/start", { email: "sam@example.com" });
    const response = await call("/api/v2/auth/email/code/verify", { email: "sam@example.com", code: lastCode() });
    const body = await response.json() as { user: { id: string } };
    expect(["relay", "unverified"]).not.toContain(body.user.id);
  });
});

/** A fake Google: real RS256 tokens from a key made here, its JWKS, its token endpoint. */
async function fakeGoogle(claims: Record<string, unknown>) {
  const pair = await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"]
  ) as CryptoKeyPair;
  const jwk = await crypto.subtle.exportKey("jwk", pair.publicKey) as JsonWebKey;
  const encode = (value: unknown) => base64urlEncode(new TextEncoder().encode(JSON.stringify(value)));
  let nonce = "";
  const token = async () => {
    const head = encode({ alg: "RS256", kid: "test-key", typ: "JWT" });
    const body = encode({ iss: "https://accounts.google.com", aud: "google-client", exp: Math.floor(Date.now() / 1000) + 600, nonce, ...claims });
    const signature = await crypto.subtle.sign({ name: "RSASSA-PKCS1-v1_5" }, pair.privateKey, new TextEncoder().encode(`${head}.${body}`));
    return `${head}.${body}.${base64urlEncode(new Uint8Array(signature))}`;
  };
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === "https://www.googleapis.com/oauth2/v3/certs") return Response.json({ keys: [{ ...jwk, kid: "test-key", alg: "RS256" }] });
    if (url === "https://oauth2.googleapis.com/token") {
      const form = new URLSearchParams(String(init?.body));
      if (form.get("code") !== "good-code" || form.get("client_secret") !== "google-secret" || !form.get("code_verifier")) return new Response("bad", { status: 400 });
      return Response.json({ id_token: await token() });
    }
    return realFetch(input, init);
  }) as typeof fetch;
  return { setNonce: (value: string) => { nonce = value; } };
}

describe("Google sign-in", () => {
  it("signs in on the web and joins the account its verified email is on", async () => {
    const { sqlite, db, env, ctx } = setup();
    sqlite.run("INSERT INTO users (id) VALUES ('existing')");
    sqlite.run(`INSERT INTO auth_identities (id, user_id, provider, provider_subject, email, email_verified)
      VALUES ('e', 'existing', 'email', 'alex@gmail.com', 'alex@gmail.com', 1)`);
    const google = await fakeGoogle({ sub: "google-123", email: "alex@gmail.com", email_verified: true, name: "Alex Kim" });
    const session = await guest(db);
    const cookie = `psid=${session}`;

    const start = await worker.fetch(new Request(`${ORIGIN}/api/v2/auth/google/web/start`, {
      method: "POST", headers: { origin: ORIGIN, cookie },
    }), env, ctx);
    expect(start.status).toBe(303);
    const location = new URL(start.headers.get("location")!);
    expect(location.origin).toBe("https://accounts.google.com");
    expect(location.searchParams.get("code_challenge_method")).toBe("S256");
    expect(location.searchParams.get("redirect_uri")).toBe(`${ORIGIN}/api/v2/auth/google/callback`);
    const state = location.searchParams.get("state")!;
    google.setNonce(location.searchParams.get("nonce")!);

    const callback = await worker.fetch(new Request(`${ORIGIN}/api/v2/auth/google/callback?state=${state}&code=good-code`, { headers: { cookie } }), env, ctx);
    expect(callback.status).toBe(303);
    expect(callback.headers.get("location")).toBe("/you/account?google=success");
    expect(sqlite.query("SELECT user_id, email_verified FROM auth_identities WHERE provider = 'google'").get()).toEqual({ user_id: "existing", email_verified: 1 });
    // The flow can't be used twice.
    const again = await worker.fetch(new Request(`${ORIGIN}/api/v2/auth/google/callback?state=${state}&code=good-code`, { headers: { cookie } }), env, ctx);
    expect(again.headers.get("location")).toBe("/you/account?google=error");
  });

  it("signs in on the iPhone through the sign-in sheet and the app's own session", async () => {
    const { sqlite, db, env, ctx, app } = setup();
    const google = await fakeGoogle({ sub: "google-456", email: "new@gmail.com", email_verified: true });
    const call = app(await guest(db));
    const started = await (await call("/api/v2/auth/google/native/start")).json() as { url: string; state: string; return_url: string };
    expect(started.return_url).toBe("pinkslip://auth/google");
    google.setNonce(new URL(started.url).searchParams.get("nonce")!);

    // The sheet carries no cookies and no bearer; the flow keeps what Google confirmed.
    const callback = await worker.fetch(new Request(`${ORIGIN}/api/v2/auth/google/callback?state=${started.state}&code=good-code`), env, ctx);
    expect(callback.status).toBe(302);
    expect(callback.headers.get("location")).toBe(`pinkslip://auth/google?result=success&state=${started.state}`);

    // Another session can't collect it.
    expect((await app(await guest(db))("/api/v2/auth/google/native/finish", { state: started.state })).status).toBe(400);
    const finished = await call("/api/v2/auth/google/native/finish", { state: started.state });
    expect(finished.status).toBe(200);
    expect(await finished.json()).toMatchObject({ session: { state: "authenticated" }, account: { providers: ["google"] }, native_token: expect.any(String) });
    expect(sqlite.query("SELECT COUNT(*) AS count FROM auth_identities WHERE provider = 'google'").get()).toEqual({ count: 1 });
  });

  it("adds Google to the account you're signed into, and never another account's Google", async () => {
    const { sqlite, db, env, ctx, app, lastCode } = setup();
    // Signed in by code as jordan@lee.dev, on the iPhone.
    const signUp = app(await guest(db));
    await signUp("/api/v2/auth/email/code/start", { email: "jordan@lee.dev" });
    const { native_token: token } = await (await signUp("/api/v2/auth/email/code/verify", { email: "jordan@lee.dev", code: lastCode() })).json() as { native_token: string };
    const call = app(token);
    const userId = (sqlite.query("SELECT user_id FROM auth_identities WHERE provider = 'email'").get() as { user_id: string }).user_id;
    const connect = async (sub: string) => {
      // Each fake signs with a new key, so the cached keys go first.
      _resetGoogleKeyCache();
      const google = await fakeGoogle({ sub, email: "jordan.lee@gmail.com", email_verified: true });
      const started = await (await call("/api/v2/auth/google/native/start")).json() as { url: string; state: string };
      google.setNonce(new URL(started.url).searchParams.get("nonce")!);
      await worker.fetch(new Request(`${ORIGIN}/api/v2/auth/google/callback?state=${started.state}&code=good-code`), env, ctx);
      return call("/api/v2/auth/google/native/finish", { state: started.state });
    };

    const connected = await connect("google-mine");
    expect(connected.status).toBe(200);
    const body = await connected.json() as Record<string, unknown>;
    expect(body).toMatchObject({ session: { state: "authenticated" }, account: { email: "jordan@lee.dev", providers: ["email", "google"] } });
    // The session stays the one the app has.
    expect(body.native_token).toBeUndefined();
    expect(sqlite.query("SELECT user_id FROM auth_identities WHERE provider = 'google'").get()).toEqual({ user_id: userId });
    // Connecting the same Google again changes nothing.
    expect((await connect("google-mine")).status).toBe(200);
    expect(sqlite.query("SELECT COUNT(*) AS count FROM auth_identities WHERE provider = 'google'").get()).toEqual({ count: 1 });

    // A Google that's already on someone else's account is refused, and neither account moves.
    sqlite.run("INSERT INTO users (id) VALUES ('other')");
    sqlite.run(`INSERT INTO auth_identities (id, user_id, provider, provider_subject, email, email_verified)
      VALUES ('o', 'other', 'google', 'google-theirs', 'them@gmail.com', 1)`);
    const refused = await connect("google-theirs");
    expect(refused.status).toBe(409);
    expect(await refused.json()).toMatchObject({ code: "google_in_use", error: "That Google account is on another Pinkslip account." });
    expect(sqlite.query("SELECT user_id FROM auth_identities WHERE provider_subject = 'google-theirs'").get()).toEqual({ user_id: "other" });
    expect((await (await call("/api/v2/me", undefined, "GET")).json() as { session: { state: string } }).session.state).toBe("authenticated");
  });

  it("returns to the app as cancelled when the person backs out", async () => {
    const { db, env, ctx, app } = setup();
    const started = await (await app(await guest(db))("/api/v2/auth/google/native/start")).json() as { state: string };
    const callback = await worker.fetch(new Request(`${ORIGIN}/api/v2/auth/google/callback?state=${started.state}&error=access_denied`), env, ctx);
    expect(callback.headers.get("location")).toBe("pinkslip://auth/google?result=cancelled");
  });

  it("refuses a token for another client or with the wrong nonce", async () => {
    const { db, env, ctx, app } = setup();
    await fakeGoogle({ sub: "google-789", email: "x@gmail.com", email_verified: true, aud: "someone-else" });
    const call = app(await guest(db));
    const started = await (await call("/api/v2/auth/google/native/start")).json() as { state: string };
    const callback = await worker.fetch(new Request(`${ORIGIN}/api/v2/auth/google/callback?state=${started.state}&code=good-code`), env, ctx);
    expect(callback.headers.get("location")).toBe("pinkslip://auth/google?result=error");
  });
});

describe("accounts", () => {
  it("says which sign-ins are on", async () => {
    const { db, app } = setup();
    const me = await (await app(await guest(db))("/api/v2/me", undefined, "GET")).json() as { features: Record<string, unknown> };
    expect(me.features).toMatchObject({ google_sign_in_enabled: true, password_sign_in_enabled: true });
  });

  it("sends Support Pinkslip's links only while SUPPORT lets this person see them", async () => {
    const { db, env, app } = setup();
    const token = await guest(db);
    const support = async () => ((await (await app(token)("/api/v2/me", undefined, "GET")).json()) as { features: { support: unknown } }).features.support;
    Object.assign(env, { SUPPORT_LINKS: { once_5: "https://buy.stripe.com/five", once_other: "https://buy.stripe.com/other" } });
    expect(await support()).toBeNull();
    Object.assign(env, { SUPPORT: "admin" });
    expect(await support()).toBeNull();
    Object.assign(env, { SUPPORT: "on" });
    expect(await support()).toEqual({ once: [{ dollars: 5, url: "https://buy.stripe.com/five" }], other: "https://buy.stripe.com/other", monthly: [] });
  });

  it("removes every sign-in method when the account is deleted", async () => {
    const { sqlite, db, app, lastCode } = setup();
    const call = app(await guest(db));
    await call("/api/v2/auth/email/code/start", { email: "alex@example.com" });
    const signedUp = await (await call("/api/v2/auth/email/code/verify", { email: "alex@example.com", code: lastCode(), password: "hunter2hunter2" })).json() as { user: { id: string }; native_token: string };
    sqlite.run(`INSERT INTO auth_identities (id, user_id, provider, provider_subject, email, email_verified)
      VALUES ('g', ?, 'google', 'google-sub', 'alex@example.com', 1)`, [signedUp.user.id]);

    expect((await app(signedUp.native_token)("/api/v2/auth/account", undefined, "DELETE")).status).toBe(200);
    expect(sqlite.query("SELECT COUNT(*) AS count FROM auth_identities WHERE user_id = ?").get(signedUp.user.id)).toEqual({ count: 0 });
    const fresh = app(await guest(db));
    expect((await fresh("/api/v2/auth/password/login", { email: "alex@example.com", password: "hunter2hunter2" })).status).toBe(401);
  });
});
