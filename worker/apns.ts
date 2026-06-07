// ─── Apple Push Notification service (APNs) ──────────────────────────────────
//
// Sends native push notifications to the iOS app over APNs' HTTP/2 + JWT API.
// Mirrors the VAPID JWT approach in push.ts: an ES256 token signed with WebCrypto,
// no Node-only dependencies, so it runs on Cloudflare Workers.
//
// APNs auth tokens are valid for up to 1 hour; reusing one for every message in a
// poll cycle (and refreshing at most ~once/hour) avoids the ExpiredProviderToken
// (403) and TooManyProviderTokenUpdates (429) errors Apple returns for churn.

import { base64urlEncode } from "./push";
import type { NotificationPayload, PushResult } from "./push";
import type { Env } from "./types";

const APNS_HOST_PRODUCTION = "api.push.apple.com";
const APNS_HOST_SANDBOX = "api.sandbox.push.apple.com";

// Refresh the provider token well before the 60-minute hard expiry.
const TOKEN_TTL_MS = 50 * 60 * 1000;

export interface ApnsConfig {
  /** APNs Auth Key ID (the 10-char identifier of the .p8 key). */
  keyId: string;
  /** Apple Developer Team ID (issuer of the token). */
  teamId: string;
  /** App bundle identifier — sent as the apns-topic header. */
  bundleId: string;
  /** PKCS#8 PEM contents of the AuthKey_XXXX.p8 file. */
  privateKey: string;
  /** When true, target the APNs sandbox host (Xcode debug / direct-install builds). */
  sandbox?: boolean;
}

interface CachedToken {
  jwt: string;
  issuedAtMs: number;
  keyId: string;
}

let tokenCache: CachedToken | null = null;

/**
 * Decodes a PKCS#8 PEM private key (the contents of an AuthKey_XXXX.p8 file)
 * into the DER bytes WebCrypto's importKey expects.
 */
function pemToPkcs8(pem: string): Uint8Array {
  const body = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Builds (or returns a cached) APNs provider JWT signed with ES256.
 *
 * Header:  { alg: "ES256", kid: <keyId> }
 * Payload: { iss: <teamId>, iat: <now> }
 *
 * crypto.subtle.sign(ECDSA) already returns the raw r||s JOSE signature that
 * JWT ES256 requires, so no DER unwrapping is needed.
 */
export async function buildApnsJwt(
  config: Pick<ApnsConfig, "keyId" | "teamId" | "privateKey">,
  nowMs: number = Date.now()
): Promise<string> {
  if (
    tokenCache &&
    tokenCache.keyId === config.keyId &&
    nowMs - tokenCache.issuedAtMs < TOKEN_TTL_MS
  ) {
    return tokenCache.jwt;
  }

  const header = base64urlEncode(
    new TextEncoder().encode(JSON.stringify({ alg: "ES256", kid: config.keyId }))
  );
  const iat = Math.floor(nowMs / 1000);
  const payload = base64urlEncode(
    new TextEncoder().encode(JSON.stringify({ iss: config.teamId, iat }))
  );
  const signingInput = `${header}.${payload}`;

  const pkcs8 = pemToPkcs8(config.privateKey);
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    pkcs8.buffer.slice(pkcs8.byteOffset, pkcs8.byteOffset + pkcs8.byteLength) as ArrayBuffer,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );

  const sigBuffer = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    cryptoKey,
    new TextEncoder().encode(signingInput)
  );

  const jwt = `${signingInput}.${base64urlEncode(sigBuffer)}`;
  tokenCache = { jwt, issuedAtMs: nowMs, keyId: config.keyId };
  return jwt;
}

/** Test/maintenance hook: clears the cached provider token. */
export function _resetApnsTokenCache(): void {
  tokenCache = null;
}

/**
 * Maps the shared NotificationPayload into an APNs payload. The `url` from the
 * web-push payload is carried at the top level so the app can deep-link on tap.
 */
export function buildApnsBody(payload: NotificationPayload): string {
  return JSON.stringify({
    aps: {
      alert: { title: payload.title, body: payload.body },
      sound: "default",
    },
    url: payload.data.url,
    job_ids: payload.data.job_ids ?? [],
  });
}

/**
 * Sends a single notification to one device token via APNs.
 * Returns the same PushResult shape as sendPushNotification so callers can
 * treat web and native results uniformly (including 410-style cleanup).
 */
export async function sendApnsNotification(
  deviceToken: string,
  payload: NotificationPayload,
  config: ApnsConfig
): Promise<PushResult> {
  try {
    const jwt = await buildApnsJwt(config);
    const host = config.sandbox ? APNS_HOST_SANDBOX : APNS_HOST_PRODUCTION;
    const body = buildApnsBody(payload);

    const response = await fetch(`https://${host}/3/device/${deviceToken}`, {
      method: "POST",
      headers: {
        authorization: `bearer ${jwt}`,
        "apns-topic": config.bundleId,
        "apns-push-type": "alert",
        "apns-priority": "10",
        "content-type": "application/json",
      },
      body,
    });

    const responseBody = await response.text();
    return { ok: response.ok, status: response.status, body: responseBody };
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
}

/**
 * Builds an ApnsConfig from the environment, or returns null when APNs isn't
 * fully configured (so callers can cleanly skip native push).
 */
export function resolveApnsConfig(env: Env): ApnsConfig | null {
  const keyId = env.APNS_KEY_ID?.trim();
  const teamId = env.APNS_TEAM_ID?.trim();
  const bundleId = env.APNS_BUNDLE_ID?.trim();
  const privateKey = env.APNS_PRIVATE_KEY?.trim();
  if (!keyId || !teamId || !bundleId || !privateKey) return null;
  return {
    keyId,
    teamId,
    bundleId,
    privateKey,
    sandbox: env.APNS_SANDBOX?.trim() === "true",
  };
}

/** APNs status codes that mean the device token is dead and should be removed. */
export function isDeadApnsToken(status: number | undefined): boolean {
  return status === 410 || status === 400;
}
