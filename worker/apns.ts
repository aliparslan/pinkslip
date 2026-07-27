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
async function postToApns(
  host: string,
  deviceToken: string,
  body: string,
  jwt: string,
  bundleId: string
): Promise<PushResult> {
  const response = await fetch(`https://${host}/3/device/${deviceToken}`, {
    method: "POST",
    headers: {
      authorization: `bearer ${jwt}`,
      "apns-topic": bundleId,
      "apns-push-type": "alert",
      "apns-priority": "10",
      "content-type": "application/json",
    },
    body,
  });

  const responseBody = await response.text();
  return { ok: response.ok, status: response.status, body: responseBody };
}

export async function sendApnsNotification(
  deviceToken: string,
  payload: NotificationPayload,
  config: ApnsConfig
): Promise<PushResult> {
  try {
    const jwt = await buildApnsJwt(config);
    const body = buildApnsBody(payload);
    const primary = config.sandbox ? APNS_HOST_SANDBOX : APNS_HOST_PRODUCTION;
    const fallback = config.sandbox ? APNS_HOST_PRODUCTION : APNS_HOST_SANDBOX;

    const result = await postToApns(primary, deviceToken, body, jwt, config.bundleId);

    // A device token is only valid against the environment that issued it: an
    // `aps-environment: development` build registers a sandbox token, a
    // TestFlight/App Store build registers a production one. Picking the wrong
    // host produces exactly one symptom — 400 BadDeviceToken — which is
    // indistinguishable from a genuinely dead token.
    //
    // During development both build types are installed at various times, so
    // rather than force a config flag to be flipped by hand (and silently
    // unsubscribe the device when it is wrong), try the other environment before
    // concluding anything. Costs one extra request, and only on failure.
    if (result.status === 400 && apnsReason(result.body) === "BadDeviceToken") {
      const retried = await postToApns(fallback, deviceToken, body, jwt, config.bundleId);
      if (retried.ok) return retried;
      // Both environments rejected it — now the token really is bad. Report the
      // second result so the caller sees a reason reflecting a real attempt.
      return retried;
    }

    return result;
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

/**
 * APNs returns its real diagnosis in the response body, e.g. {"reason":"BadDeviceToken"}.
 * A bare status is nearly useless: 400 alone cannot distinguish "this token is
 * dead" from "we sent a malformed request".
 */
export function apnsReason(body: string | undefined): string | null {
  if (!body) return null;
  try {
    const parsed = JSON.parse(body) as { reason?: unknown };
    return typeof parsed.reason === "string" ? parsed.reason : null;
  } catch {
    return null;
  }
}

/**
 * Reasons that genuinely mean the device token will never work again.
 * Everything else 400 covers — BadTopic, MissingTopic, BadPriority,
 * PayloadTooLarge, BadExpirationDate — is a bug on OUR side, and deleting the
 * user's subscription for those is both destructive and self-inflicted: it
 * silently unsubscribes them from a defect we caused, and they have to notice
 * and re-enable notifications by hand.
 */
const DEAD_TOKEN_REASONS = new Set([
  "BadDeviceToken",
  "DeviceTokenNotForTopic",
  "Unregistered",
  "ExpiredToken",
]);

/**
 * Whether the device token is dead and should be removed.
 *
 * 410 always means gone. For 400 we require the reason to actually name a token
 * problem — previously any 400 removed the subscription, which is how a single
 * malformed request could permanently unsubscribe a device.
 */
export function isDeadApnsToken(
  status: number | undefined,
  body?: string
): boolean {
  if (status === 410) return true;
  if (status !== 400) return false;
  const reason = apnsReason(body);
  // No parseable reason: don't guess, and don't destroy the subscription.
  return reason !== null && DEAD_TOKEN_REASONS.has(reason);
}
