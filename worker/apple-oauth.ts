import { base64urlDecode, base64urlEncode } from "./crypto";
import type { Env } from "./types";

const APPLE_AUDIENCE = "https://appleid.apple.com";
const APPLE_TOKEN_URL = `${APPLE_AUDIENCE}/auth/token`;
const APPLE_REVOKE_URL = `${APPLE_AUDIENCE}/auth/revoke`;
const CLIENT_SECRET_TTL_SECONDS = 5 * 60;

export interface AppleServerConfig {
  clientId: string;
  teamId: string;
  keyId: string;
  privateKey: string;
  encryptionKey: string;
}

export interface AppleTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
  id_token: string;
}

type AppleOAuthFetch = (input: string, init?: RequestInit) => Promise<Response>;

export type AppleRevocationResult = "revoked" | "no_token" | "not_configured" | "failed";

function pemToPkcs8(pem: string): Uint8Array {
  const body = pem
    .replace(/\\n/g, "\n")
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function encryptionKeyBytes(encoded: string): Uint8Array {
  const bytes = base64urlDecode(encoded.trim());
  if (bytes.byteLength !== 32) {
    throw new Error("APPLE_TOKEN_ENCRYPTION_KEY must be 32 base64url-encoded bytes");
  }
  return bytes;
}

export function resolveAppleServerConfig(env: Env, audience?: string): AppleServerConfig | null {
  const nativeClient = env.APPLE_SIGN_IN_CLIENT_ID?.trim() || env.APPLE_APP_ID?.trim();
  const clientId = audience ?? nativeClient;
  if (audience && audience !== nativeClient && audience !== env.APPLE_WEB_CLIENT_ID?.trim()) return null;
  const teamId = env.APPLE_TEAM_ID?.trim();
  const keyId = env.APPLE_SIGN_IN_KEY_ID?.trim();
  const privateKey = env.APPLE_SIGN_IN_PRIVATE_KEY?.trim();
  const encryptionKey = env.APPLE_TOKEN_ENCRYPTION_KEY?.trim();
  if (!clientId || !teamId || !keyId || !privateKey || !encryptionKey) return null;
  return { clientId, teamId, keyId, privateKey, encryptionKey };
}

/** Build the short-lived ES256 developer token Apple requires as client_secret. */
export async function buildAppleClientSecret(
  config: Pick<AppleServerConfig, "clientId" | "teamId" | "keyId" | "privateKey">,
  nowMs = Date.now(),
): Promise<string> {
  const issuedAt = Math.floor(nowMs / 1000);
  const header = base64urlEncode(
    new TextEncoder().encode(JSON.stringify({ alg: "ES256", kid: config.keyId })),
  );
  const payload = base64urlEncode(new TextEncoder().encode(JSON.stringify({
    iss: config.teamId,
    iat: issuedAt,
    exp: issuedAt + CLIENT_SECRET_TTL_SECONDS,
    aud: APPLE_AUDIENCE,
    sub: config.clientId,
  })));
  const signingInput = `${header}.${payload}`;
  const pkcs8 = pemToPkcs8(config.privateKey);
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pkcs8.buffer.slice(pkcs8.byteOffset, pkcs8.byteOffset + pkcs8.byteLength) as ArrayBuffer,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    new TextEncoder().encode(signingInput),
  );
  return `${signingInput}.${base64urlEncode(new Uint8Array(signature))}`;
}

async function appleFormRequest(
  url: string,
  form: URLSearchParams,
  fetcher: AppleOAuthFetch,
): Promise<Response> {
  return fetcher(url, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
}

export async function exchangeAppleAuthorizationCode(
  config: AppleServerConfig,
  authorizationCode: string,
  fetcher: AppleOAuthFetch = (input, init) => fetch(input, init),
  redirectUri?: string,
): Promise<AppleTokenResponse> {
  const response = await appleFormRequest(APPLE_TOKEN_URL, new URLSearchParams({
    client_id: config.clientId,
    client_secret: await buildAppleClientSecret(config),
    code: authorizationCode,
    grant_type: "authorization_code",
    ...(redirectUri ? { redirect_uri: redirectUri } : {}),
  }), fetcher);
  type AppleTokenBody = Partial<AppleTokenResponse> & { error?: string };
  const body = await response.json<AppleTokenBody>().catch((): AppleTokenBody => ({}));
  if (
    !response.ok
    || !body.refresh_token
    || !body.access_token
    || !body.id_token
    || typeof body.expires_in !== "number"
  ) {
    throw new Error(`Apple authorization code exchange failed (${body.error || response.status})`);
  }
  return body as AppleTokenResponse;
}

export async function revokeAppleRefreshToken(
  config: AppleServerConfig,
  refreshToken: string,
  fetcher: AppleOAuthFetch = (input, init) => fetch(input, init),
): Promise<void> {
  const response = await appleFormRequest(APPLE_REVOKE_URL, new URLSearchParams({
    client_id: config.clientId,
    client_secret: await buildAppleClientSecret(config),
    token: refreshToken,
    token_type_hint: "refresh_token",
  }), fetcher);
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Apple token revocation failed (${response.status}${body ? `: ${body.slice(0, 160)}` : ""})`);
  }
}

export async function encryptAppleRefreshToken(
  refreshToken: string,
  identityId: string,
  encodedKey: string,
): Promise<string> {
  const keyBytes = encryptionKeyBytes(encodedKey);
  const key = await crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
      additionalData: new TextEncoder().encode(identityId),
    },
    key,
    new TextEncoder().encode(refreshToken),
  );
  return `${base64urlEncode(iv)}.${base64urlEncode(new Uint8Array(ciphertext))}`;
}

export async function decryptAppleRefreshToken(
  encryptedToken: string,
  identityId: string,
  encodedKey: string,
): Promise<string> {
  const [encodedIv, encodedCiphertext, ...extra] = encryptedToken.split(".");
  if (!encodedIv || !encodedCiphertext || extra.length > 0) {
    throw new Error("Stored Apple refresh token is malformed");
  }
  const keyBytes = encryptionKeyBytes(encodedKey);
  const key = await crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, ["decrypt"]);
  const plaintext = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: base64urlDecode(encodedIv),
      additionalData: new TextEncoder().encode(identityId),
    },
    key,
    base64urlDecode(encodedCiphertext),
  );
  return new TextDecoder().decode(plaintext);
}

export async function storeAppleRefreshToken(
  db: D1Database,
  config: AppleServerConfig,
  identityId: string,
  userId: string,
  refreshToken: string,
): Promise<void> {
  // Bind the token to its issuing client without a schema migration. Old rows
  // contain a plain token and retain the native client on read.
  const encrypted = await encryptAppleRefreshToken(JSON.stringify({ refreshToken, clientId: config.clientId }), identityId, config.encryptionKey);
  const now = new Date().toISOString();
  await db.prepare(
    `INSERT INTO apple_refresh_tokens (identity_id, user_id, encrypted_token, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(identity_id) DO UPDATE SET
       user_id = excluded.user_id,
       encrypted_token = excluded.encrypted_token,
       updated_at = excluded.updated_at`,
  ).bind(identityId, userId, encrypted, now, now).run();
}

export async function revokeAppleAuthorizationForUser(
  env: Env,
  userId: string,
): Promise<AppleRevocationResult> {
  const config = resolveAppleServerConfig(env);
  if (!config) return "not_configured";
  const row = await env.DB.prepare(
    `SELECT art.identity_id, art.encrypted_token
     FROM apple_refresh_tokens art
     JOIN auth_identities ai ON ai.id = art.identity_id
     WHERE art.user_id = ? AND ai.provider = 'apple'
     ORDER BY datetime(art.updated_at) DESC
     LIMIT 1`,
  ).bind(userId).first<{ identity_id: string; encrypted_token: string }>();
  if (!row) return "no_token";
  try {
    const stored = await decryptAppleRefreshToken(
      row.encrypted_token,
      row.identity_id,
      config.encryptionKey,
    );
    const envelope = stored.startsWith("{") ? JSON.parse(stored) as { refreshToken: string; clientId: string } : null;
    const issuer = envelope ? resolveAppleServerConfig(env, envelope.clientId) : config;
    if (!issuer || (envelope && typeof envelope.refreshToken !== "string")) throw new Error("Stored Apple client is not configured");
    await revokeAppleRefreshToken(issuer, envelope?.refreshToken ?? stored);
    return "revoked";
  } catch (error) {
    console.error(JSON.stringify({
      message: "apple token revocation failed",
      error: error instanceof Error ? error.message : String(error),
      userId,
    }));
    return "failed";
  }
}
