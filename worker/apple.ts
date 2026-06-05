import type { Env } from "./types";
import { base64urlDecode } from "./crypto";

interface AppleJwtHeader {
  alg: string;
  kid: string;
}

interface AppleJwtPayload {
  iss: string;
  aud: string | string[];
  exp: number;
  iat?: number;
  sub: string;
  email?: string;
  email_verified?: boolean | string;
  nonce?: string;
}

// Apple signs identity tokens with RS256 (RSA), so its JWKS keys are RSA keys
// with modulus `n` and exponent `e` — NOT EC keys with crv/x/y.
interface AppleJwk {
  kty: string;
  kid: string;
  use: string;
  alg: string;
  n: string;
  e: string;
}

let cachedKeys: { fetchedAt: number; keys: AppleJwk[] } | null = null;

function parseJwtPart<T>(value: string): T {
  return JSON.parse(new TextDecoder().decode(base64urlDecode(value))) as T;
}

async function fetchAppleKeys(): Promise<AppleJwk[]> {
  const now = Date.now();
  if (cachedKeys && now - cachedKeys.fetchedAt < 60 * 60 * 1000) {
    return cachedKeys.keys;
  }

  const response = await fetch("https://appleid.apple.com/auth/keys");
  if (!response.ok) {
    throw new Error(`Could not load Apple signing keys (${response.status})`);
  }

  const payload = await response.json<{ keys: AppleJwk[] }>();
  cachedKeys = { fetchedAt: now, keys: payload.keys ?? [] };
  return cachedKeys.keys;
}

function resolveExpectedAudience(env: Env): string {
  return env.APPLE_APP_ID?.trim() || env.APNS_BUNDLE_ID?.trim() || "dev.alip.pinkslip";
}

export async function verifyAppleIdentityToken(
  env: Env,
  identityToken: string,
  expectedNonce?: string
): Promise<AppleJwtPayload> {
  const parts = identityToken.split(".");
  if (parts.length !== 3) {
    throw new Error("Malformed Apple identity token");
  }

  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const header = parseJwtPart<AppleJwtHeader>(encodedHeader);
  const payload = parseJwtPart<AppleJwtPayload>(encodedPayload);

  const jwks = await fetchAppleKeys();
  const jwk = jwks.find((candidate) => candidate.kid === header.kid && candidate.alg === header.alg);
  if (!jwk) {
    throw new Error("Could not find a matching Apple signing key");
  }

  const key = await crypto.subtle.importKey(
    "jwk",
    {
      kty: jwk.kty,
      n: jwk.n,
      e: jwk.e,
      alg: "RS256",
      ext: true,
    },
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"]
  );

  // RS256 JWT signatures are the raw RSA signature bytes (no JOSE r||s / DER
  // re-encoding needed, unlike ES256), so verify the decoded signature directly.
  const verified = await crypto.subtle.verify(
    { name: "RSASSA-PKCS1-v1_5" },
    key,
    base64urlDecode(encodedSignature),
    new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`)
  );

  if (!verified) {
    throw new Error("Apple identity token signature verification failed");
  }

  if (payload.iss !== "https://appleid.apple.com") {
    throw new Error("Apple identity token issuer mismatch");
  }

  const expectedAudience = resolveExpectedAudience(env);
  const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!audiences.includes(expectedAudience)) {
    throw new Error("Apple identity token audience mismatch");
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (payload.exp <= nowSeconds) {
    throw new Error("Apple identity token has expired");
  }

  if (expectedNonce && payload.nonce !== expectedNonce) {
    throw new Error("Apple identity token nonce mismatch");
  }

  return payload;
}
