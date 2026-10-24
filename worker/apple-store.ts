import { base64urlDecode, base64urlEncode } from "./crypto";
import type { Env } from "./types";

/**
 * Apple's App Store Server API (owner, 2026-10-24: Pinkslip checks purchases
 * itself, no RevenueCat). Everything Pinkslip believes about a subscription
 * comes from asking Apple over TLS, so nothing Apple signs has to be verified
 * here: a notification only says whom to ask about.
 */

export interface AppleStoreConfig {
  keyId: string;
  issuerId: string;
  privateKey: string;
  bundleId: string;
}

export type AppleEnvironment = "Production" | "Sandbox";

const HOSTS: Record<AppleEnvironment, string> = {
  Production: "https://api.storekit.itunes.apple.com",
  Sandbox: "https://api.storekit-sandbox.itunes.apple.com",
};

/** The In-App Purchase key from App Store Connect (Users and Access →
 * Integrations); null until it's set. */
export function resolveAppleStoreConfig(env: Env): AppleStoreConfig | null {
  const keyId = env.APPLE_IAP_KEY_ID?.trim();
  const issuerId = env.APPLE_IAP_ISSUER_ID?.trim();
  const privateKey = env.APPLE_IAP_PRIVATE_KEY?.trim();
  const bundleId = env.APPLE_APP_ID?.trim() || "dev.alip.pinkslip";
  return keyId && issuerId && privateKey ? { keyId, issuerId, privateKey, bundleId } : null;
}

function pemToPkcs8(pem: string): ArrayBuffer {
  const bytes = base64urlDecode(pem.replace(/-----(BEGIN|END) PRIVATE KEY-----/g, "").replace(/\s+/g, ""));
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

/** The API's bearer token: ES256, signed with the In-App Purchase key, good
 * for up to an hour (this one for 20 minutes). */
export async function appleStoreJwt(config: AppleStoreConfig, nowMs = Date.now()): Promise<string> {
  const encode = (value: unknown) => base64urlEncode(new TextEncoder().encode(JSON.stringify(value)));
  const iat = Math.floor(nowMs / 1000);
  const signingInput = `${encode({ alg: "ES256", kid: config.keyId, typ: "JWT" })}.${encode({
    iss: config.issuerId, iat, exp: iat + 20 * 60, aud: "appstoreconnect-v1", bid: config.bundleId,
  })}`;
  const key = await crypto.subtle.importKey("pkcs8", pemToPkcs8(config.privateKey), { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  // WebCrypto's ECDSA signature is already the raw r||s that ES256 wants.
  const signature = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(signingInput));
  return `${signingInput}.${base64urlEncode(new Uint8Array(signature))}`;
}

/** A JWS's payload, read without checking its signature: only for things
 * Pinkslip fetched from Apple itself, or to learn whom to ask about. */
export function decodeJwsPayload<T>(jws: string): T | null {
  const part = jws.split(".")[1];
  if (!part) return null;
  try {
    return JSON.parse(new TextDecoder().decode(base64urlDecode(part))) as T;
  } catch {
    return null;
  }
}

/** JWSTransactionDecodedPayload, the fields Pinkslip uses. */
export interface AppleTransaction {
  transactionId: string;
  originalTransactionId: string;
  bundleId: string;
  productId: string;
  purchaseDate: number;
  originalPurchaseDate: number;
  expiresDate?: number;
  /** The UUID the app passed at purchase: the person's user id. */
  appAccountToken?: string;
  /** 1 is an introductory offer, such as the free trial. */
  offerType?: number;
  offerDiscountType?: string;
  revocationDate?: number;
  environment?: AppleEnvironment;
}

/** JWSRenewalInfoDecodedPayload, the fields Pinkslip uses. */
export interface AppleRenewal {
  /** 1 renews, 0 is turned off. */
  autoRenewStatus?: number;
  autoRenewProductId?: string;
  gracePeriodExpiresDate?: number;
}

/** One subscription's state: 1 active, 2 expired, 3 retrying a failed
 * payment, 4 in the grace period, 5 revoked (a refund). */
export interface AppleSubscription {
  status: number;
  transaction: AppleTransaction;
  renewal: AppleRenewal | null;
}

export class AppleStoreError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

interface StatusResponse {
  environment?: AppleEnvironment;
  bundleId?: string;
  data?: Array<{ lastTransactions?: Array<{ status: number; signedTransactionInfo: string; signedRenewalInfo?: string }> }>;
}

/** "Get All Subscription Statuses" for any transaction in the family.
 * Production first, then Sandbox (TestFlight and Xcode buy in Sandbox), as
 * Apple advises; `prefer` starts with the one a notification named. Null
 * when neither knows the transaction. */
export async function appleSubscriptions(
  config: AppleStoreConfig,
  transactionId: string,
  options: { prefer?: AppleEnvironment; fetcher?: typeof fetch; nowMs?: number } = {},
): Promise<{ environment: AppleEnvironment; subscriptions: AppleSubscription[] } | null> {
  const fetcher = options.fetcher ?? fetch;
  const order: AppleEnvironment[] = options.prefer === "Sandbox" ? ["Sandbox", "Production"] : ["Production", "Sandbox"];
  const token = await appleStoreJwt(config, options.nowMs);
  for (const environment of order) {
    const response = await fetcher(`${HOSTS[environment]}/inApps/v1/subscriptions/${encodeURIComponent(transactionId)}`, {
      headers: { authorization: `Bearer ${token}` },
    });
    if (response.status === 404) continue;
    if (!response.ok) throw new AppleStoreError(`App Store Server API answered ${response.status}`, response.status);
    const body = await response.json() as StatusResponse;
    if (body.bundleId && body.bundleId !== config.bundleId) return null;
    const subscriptions = (body.data ?? []).flatMap((group) => group.lastTransactions ?? []).flatMap((last) => {
      const transaction = decodeJwsPayload<AppleTransaction>(last.signedTransactionInfo);
      if (!transaction || transaction.bundleId !== config.bundleId) return [];
      return [{ status: last.status, transaction, renewal: last.signedRenewalInfo ? decodeJwsPayload<AppleRenewal>(last.signedRenewalInfo) : null }];
    });
    return { environment: body.environment ?? environment, subscriptions };
  }
  return null;
}
