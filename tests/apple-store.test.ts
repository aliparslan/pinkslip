import { Database } from "bun:sqlite";
import { afterEach, describe, expect, it } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { appleStoreJwt, appleSubscriptions, type AppleStoreConfig, type AppleTransaction } from "@worker/apple-store";
import { createGuestSession } from "@worker/auth";
import { base64urlDecode, base64urlEncode } from "@worker/crypto";
import worker from "@worker/index";
import { planState, setPlanByAdmin, syncAppleSubscription } from "@worker/plans";
import type { Env } from "@worker/types";
import { sqliteD1 } from "./sqlite-d1";

const migrationsDir = new URL("../migrations/", import.meta.url).pathname;
const databases: Database[] = [];
const realFetch = globalThis.fetch;
afterEach(() => {
  for (const db of databases.splice(0)) db.close();
  globalThis.fetch = realFetch;
});

const NOW = new Date("2026-10-24T15:00:00Z");
const DAY = 86_400_000;
const encode = (value: unknown) => base64urlEncode(new TextEncoder().encode(JSON.stringify(value)));
/** Apple's JWS shape; Pinkslip reads what it fetched without checking the signature. */
const jws = (payload: unknown) => `${encode({ alg: "ES256" })}.${encode(payload)}.sig`;

async function iapKey() {
  const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]) as CryptoKeyPair;
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey("pkcs8", pair.privateKey) as ArrayBuffer);
  const pem = `-----BEGIN PRIVATE KEY-----\n${btoa(String.fromCharCode(...pkcs8))}\n-----END PRIVATE KEY-----`;
  return { pem, publicKey: pair.publicKey };
}

function transaction(overrides: Partial<AppleTransaction> = {}): AppleTransaction {
  return {
    transactionId: "2000000111", originalTransactionId: "2000000100", bundleId: "dev.alip.pinkslip",
    productId: "dev.alip.pinkslip.pro.weekly", purchaseDate: NOW.getTime(), originalPurchaseDate: NOW.getTime(),
    expiresDate: NOW.getTime() + 3 * DAY, ...overrides,
  };
}

/** A fake App Store Server API: what "Get All Subscription Statuses" says, in Sandbox (as TestFlight is). */
function fakeApple(state: { status: number; transaction: AppleTransaction; autoRenew?: number }, calls: string[] = []) {
  return (async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    if (url.startsWith("https://api.storekit.itunes.apple.com")) return new Response("{}", { status: 404 });
    return Response.json({
      environment: "Sandbox", bundleId: "dev.alip.pinkslip",
      data: [{ lastTransactions: [{
        status: state.status, signedTransactionInfo: jws(state.transaction), signedRenewalInfo: jws({ autoRenewStatus: state.autoRenew ?? 1 }),
      }] }],
    });
  }) as unknown as typeof fetch;
}

async function setup() {
  const { sqlite, db } = sqliteD1();
  databases.push(sqlite);
  for (const file of readdirSync(migrationsDir).filter((name) => name.endsWith(".sql")).sort()) {
    sqlite.exec(readFileSync(`${migrationsDir}${file}`, "utf8"));
  }
  sqlite.exec("PRAGMA foreign_keys = ON");
  const key = await iapKey();
  const config: AppleStoreConfig = { keyId: "KEY123", issuerId: "issuer-1", privateKey: key.pem, bundleId: "dev.alip.pinkslip" };
  const env = {
    DB: db, APPLE_APP_ID: "dev.alip.pinkslip", APPLE_IAP_KEY_ID: "KEY123", APPLE_IAP_ISSUER_ID: "issuer-1", APPLE_IAP_PRIVATE_KEY: key.pem,
  } as unknown as Env;
  const ctx = { waitUntil() {}, passThroughOnException() {} } as unknown as ExecutionContext;
  const call = (token: string | null, path: string, body?: unknown, method = "POST") => worker.fetch(new Request(`https://pinkslip.work${path}`, {
    method,
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), "content-type": "application/json", "x-pinkslip-client": "ios" },
    body: body === undefined ? undefined : JSON.stringify(body),
  }), env, ctx);
  const guest = async () => {
    const session = await createGuestSession(db);
    return { token: session.id, userId: session.user_id };
  };
  return { sqlite, db, env, config, key, call, guest };
}

describe("the App Store Server API", () => {
  it("signs its bearer token with the In-App Purchase key", async () => {
    const { config, key } = await setup();
    const token = await appleStoreJwt(config, NOW.getTime());
    const [header, payload, signature] = token.split(".");
    expect(JSON.parse(new TextDecoder().decode(base64urlDecode(header!)))).toEqual({ alg: "ES256", kid: "KEY123", typ: "JWT" });
    expect(JSON.parse(new TextDecoder().decode(base64urlDecode(payload!)))).toMatchObject({
      iss: "issuer-1", aud: "appstoreconnect-v1", bid: "dev.alip.pinkslip", iat: NOW.getTime() / 1000,
    });
    expect(await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, key.publicKey, base64urlDecode(signature!), new TextEncoder().encode(`${header}.${payload}`))).toBe(true);
  });

  it("asks Production first, then Sandbox, and reads what Apple returns", async () => {
    const { config } = await setup();
    const calls: string[] = [];
    const found = await appleSubscriptions(config, "2000000111", { fetcher: fakeApple({ status: 1, transaction: transaction() }, calls) });
    expect(calls).toEqual([
      "https://api.storekit.itunes.apple.com/inApps/v1/subscriptions/2000000111",
      "https://api.storekit-sandbox.itunes.apple.com/inApps/v1/subscriptions/2000000111",
    ]);
    expect(found?.environment).toBe("Sandbox");
    expect(found?.subscriptions[0]).toMatchObject({ status: 1, transaction: { productId: "dev.alip.pinkslip.pro.weekly" }, renewal: { autoRenewStatus: 1 } });
  });
});

describe("Pro from Apple", () => {
  it("starts with the free trial, follows renewals, and ends on expiry or a refund", async () => {
    const { db, env, config, guest } = await setup();
    const { userId } = await guest();
    const trial = transaction({ offerType: 1, offerDiscountType: "FREE_TRIAL", appAccountToken: userId });
    expect(await syncAppleSubscription(db, config, { transactionId: "2000000111", userId, fetcher: fakeApple({ status: 1, transaction: trial }), now: NOW }))
      .toEqual({ ok: true, userId, pro: true });
    expect(await planState(env, userId, NOW)).toMatchObject({
      plan: "pro", source: "trial", period: "week", will_renew: true, trial: { available: false },
      ends_at: new Date(NOW.getTime() + 3 * DAY).toISOString(),
    });

    // The first paid week: a renewal moves the end.
    const renewed = transaction({ transactionId: "2000000112", purchaseDate: NOW.getTime() + 3 * DAY, expiresDate: NOW.getTime() + 10 * DAY, appAccountToken: userId });
    await syncAppleSubscription(db, config, { transactionId: "2000000100", fetcher: fakeApple({ status: 1, transaction: renewed, autoRenew: 0 }), now: NOW });
    expect(await planState(env, userId, NOW)).toMatchObject({ plan: "pro", source: "apple", will_renew: false, trial: { available: false } });

    await syncAppleSubscription(db, config, { transactionId: "2000000100", fetcher: fakeApple({ status: 2, transaction: renewed }), now: NOW });
    expect((await planState(env, userId, NOW)).plan).toBe("free");
    await syncAppleSubscription(db, config, { transactionId: "2000000100", fetcher: fakeApple({ status: 1, transaction: renewed }), now: NOW });
    await syncAppleSubscription(db, config, { transactionId: "2000000100", fetcher: fakeApple({ status: 5, transaction: { ...renewed, revocationDate: NOW.getTime() } }), now: NOW });
    expect((await planState(env, userId, NOW)).plan).toBe("free");
  });

  it("keeps a subscription with the account that holds it, and an admin's Pro when one ends", async () => {
    const { db, env, config, guest } = await setup();
    const first = await guest();
    const second = await guest();
    const bought = transaction({ appAccountToken: first.userId });
    await syncAppleSubscription(db, config, { transactionId: "2000000111", userId: first.userId, fetcher: fakeApple({ status: 1, transaction: bought }), now: NOW });
    expect(await syncAppleSubscription(db, config, { transactionId: "2000000111", userId: second.userId, fetcher: fakeApple({ status: 1, transaction: bought }), now: NOW }))
      .toEqual({ ok: false, code: "owned_elsewhere" });

    const tester = await guest();
    await setPlanByAdmin(db, tester.userId, "pro", null, NOW);
    await syncAppleSubscription(db, config, { transactionId: "3000000100", userId: tester.userId, fetcher: fakeApple({ status: 2, transaction: transaction({ originalTransactionId: "3000000100" }) }), now: NOW });
    expect(await planState(env, tester.userId, NOW)).toMatchObject({ plan: "pro", source: "admin" });
  });

  it("offers ending Pro once an application reaches Offer", async () => {
    const { db, env, sqlite, guest } = await setup();
    const { userId } = await guest();
    await setPlanByAdmin(db, userId, "pro", null, NOW);
    expect((await planState(env, userId, NOW)).offer_application).toBeNull();
    sqlite.run(`INSERT INTO applications (id, user_id, company_name, title, stage, created_at, updated_at, stage_changed_at)
      VALUES ('app-1', ?, 'Ramp', 'Software Engineer', 'offer', ?, ?, ?)`, [userId, NOW.toISOString(), NOW.toISOString(), NOW.toISOString()]);
    expect((await planState(env, userId, NOW)).offer_application).toEqual({ id: "app-1", company_name: "Ramp" });
  });
});

describe("the purchase routes", () => {
  it("check a purchase from the app, and refuse until the key is set", async () => {
    const { env, call, guest } = await setup();
    const { token, userId } = await guest();
    globalThis.fetch = fakeApple({ status: 1, transaction: transaction({ appAccountToken: userId, expiresDate: Date.now() + 3 * DAY }) });
    expect((await call(token, "/api/v2/plan/apple", { transaction_id: "abc" })).status).toBe(400);
    const bought = await call(token, "/api/v2/plan/apple", { transaction_id: "2000000111" });
    expect(bought.status).toBe(200);
    expect(await bought.json() as unknown).toMatchObject({ plan: "pro", source: "apple", period: "week" });
    Object.assign(env, { APPLE_IAP_PRIVATE_KEY: undefined });
    expect((await call(token, "/api/v2/plan/apple", { transaction_id: "2000000111" })).status).toBe(503);
  });

  it("take Apple's notifications without a session, and ask Apple what happened", async () => {
    const { env, call, guest } = await setup();
    const { userId } = await guest();
    const bought = transaction({ appAccountToken: userId, expiresDate: Date.now() + 3 * DAY });
    globalThis.fetch = fakeApple({ status: 1, transaction: bought });
    const subscribed = await call(null, "/api/v2/apple/notifications", {
      signedPayload: jws({ notificationType: "SUBSCRIBED", data: { environment: "Sandbox", bundleId: "dev.alip.pinkslip", signedTransactionInfo: jws(bought) } }),
    });
    expect(subscribed.status).toBe(200);
    expect((await planState(env, userId)).plan).toBe("pro");

    // The post only names the subscription; what Apple says decides.
    globalThis.fetch = fakeApple({ status: 2, transaction: bought });
    await call(null, "/api/v2/apple/notifications", {
      signedPayload: jws({ notificationType: "DID_RENEW", data: { signedTransactionInfo: jws(bought) } }),
    });
    expect((await planState(env, userId)).plan).toBe("free");

    expect((await call(null, "/api/v2/apple/notifications", { signedPayload: jws({ notificationType: "TEST" }) })).status).toBe(200);
    expect((await call(null, "/api/v2/apple/notifications", { signedPayload: "nonsense" })).status).toBe(400);
    globalThis.fetch = (async () => new Response("down", { status: 500 })) as unknown as typeof fetch;
    expect((await call(null, "/api/v2/apple/notifications", {
      signedPayload: jws({ notificationType: "DID_RENEW", data: { signedTransactionInfo: jws(bought) } }),
    })).status).toBe(500);
  });
});
