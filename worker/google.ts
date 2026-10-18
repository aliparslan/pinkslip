import { base64urlDecode, base64urlEncode, randomOpaqueToken } from "./crypto";
import type { Env } from "./types";

/*
 * Google sign-in (Decisions: Accounts #1): Google's own page in the system's
 * sign-in sheet on the iPhone (no SDK, so it ships over the air) and in the
 * browser on the web. Authorization code with PKCE; the server exchanges the
 * code with its client secret and accepts only a Google-signed ID token for
 * this client, with the flow's nonce.
 *
 * Owner setup: a Google OAuth client (Web application) with
 * https://pinkslip.work/api/v2/auth/google/callback as a redirect URI, then
 * GOOGLE_CLIENT_ID (a var) and GOOGLE_CLIENT_SECRET (a secret).
 */

export const GOOGLE_CALLBACK = "/api/v2/auth/google/callback";
const FLOW_TTL_MS = 10 * 60 * 1000;
const ORIGINS = new Set(["https://pinkslip.work", "https://pinkslip.alip.dev"]);

export interface GoogleConfig {
  clientId: string;
  clientSecret: string;
}

export function googleConfig(env: Env): GoogleConfig | null {
  const clientId = env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = env.GOOGLE_CLIENT_SECRET?.trim();
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

/** Production's hostnames, and localhost for development. */
export function allowedGoogleOrigin(origin: string): boolean {
  if (ORIGINS.has(origin)) return true;
  try {
    const { hostname, protocol } = new URL(origin);
    return protocol === "http:" && (hostname === "localhost" || hostname === "127.0.0.1");
  } catch {
    return false;
  }
}

export interface GoogleIdentity {
  sub: string;
  email: string | null;
  emailVerified: boolean;
  name: string | null;
}

export interface OAuthFlowRow {
  id: string;
  client: "web" | "native";
  session_id: string;
  nonce: string;
  code_verifier: string;
  origin: string;
  result_json: string | null;
  expires_at: string;
  consumed_at: string | null;
}

async function challengeFor(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64urlEncode(new Uint8Array(digest));
}

/** Starts a flow bound to the session and returns Google's sign-in page. */
export async function startGoogleFlow(
  db: D1Database,
  config: GoogleConfig,
  flow: { client: "web" | "native"; sessionId: string; origin: string },
  now = new Date()
): Promise<{ state: string; url: string }> {
  await db.prepare("DELETE FROM oauth_flows WHERE expires_at < ?").bind(new Date(now.getTime() - 86_400_000).toISOString()).run();
  const state = randomOpaqueToken(32);
  const nonce = randomOpaqueToken(32);
  const verifier = randomOpaqueToken(48);
  await db.prepare(
    `INSERT INTO oauth_flows (id, provider, client, session_id, nonce, code_verifier, origin, created_at, expires_at)
     VALUES (?, 'google', ?, ?, ?, ?, ?, ?, ?)`
  ).bind(state, flow.client, flow.sessionId, nonce, verifier, flow.origin, now.toISOString(), new Date(now.getTime() + FLOW_TTL_MS).toISOString()).run();
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: flow.origin + GOOGLE_CALLBACK,
    response_type: "code",
    scope: "openid email profile",
    state,
    nonce,
    code_challenge: await challengeFor(verifier),
    code_challenge_method: "S256",
    prompt: "select_account",
  }).toString();
  return { state, url: url.toString() };
}

export async function loadGoogleFlow(db: D1Database, state: string, now = new Date()): Promise<OAuthFlowRow | null> {
  if (!state || state.length > 128) return null;
  return db.prepare(
    `SELECT id, client, session_id, nonce, code_verifier, origin, result_json, expires_at, consumed_at
     FROM oauth_flows WHERE id = ? AND provider = 'google' AND consumed_at IS NULL AND expires_at > ?`
  ).bind(state, now.toISOString()).first<OAuthFlowRow>();
}

/** Marks a flow used; false when another request got there first. */
export async function consumeGoogleFlow(db: D1Database, state: string, now = new Date()): Promise<boolean> {
  const result = await db.prepare("UPDATE oauth_flows SET consumed_at = ? WHERE id = ? AND consumed_at IS NULL")
    .bind(now.toISOString(), state).run();
  return (result.meta?.changes ?? 0) > 0;
}

interface GoogleJwk {
  kid: string;
  kty: string;
  alg?: string;
  n: string;
  e: string;
}

let cachedKeys: { fetchedAt: number; keys: GoogleJwk[] } | null = null;

async function googleKeys(fetcher: typeof fetch): Promise<GoogleJwk[]> {
  if (cachedKeys && Date.now() - cachedKeys.fetchedAt < 60 * 60 * 1000) return cachedKeys.keys;
  const response = await fetcher("https://www.googleapis.com/oauth2/v3/certs");
  if (!response.ok) throw new Error(`Could not load Google's signing keys (${response.status})`);
  const body = await response.json() as { keys?: GoogleJwk[] };
  cachedKeys = { fetchedAt: Date.now(), keys: body.keys ?? [] };
  return cachedKeys.keys;
}

export function _resetGoogleKeyCache() {
  cachedKeys = null;
}

function jsonPart<T>(part: string): T {
  return JSON.parse(new TextDecoder().decode(base64urlDecode(part))) as T;
}

/** Checks a Google ID token: Google's signature, issuer, this client, not expired, the flow's nonce. */
export async function verifyGoogleIdToken(
  token: string,
  config: GoogleConfig,
  nonce: string,
  fetcher: typeof fetch = fetch,
  nowSeconds = Math.floor(Date.now() / 1000)
): Promise<GoogleIdentity> {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Malformed Google ID token");
  const [header, payload, signature] = parts as [string, string, string];
  const head = jsonPart<{ alg: string; kid: string }>(header);
  if (head.alg !== "RS256") throw new Error("Unexpected Google token algorithm");
  const jwk = (await googleKeys(fetcher)).find((key) => key.kid === head.kid);
  if (!jwk) throw new Error("No matching Google signing key");
  const key = await crypto.subtle.importKey(
    "jwk",
    { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: "RS256", ext: true },
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"]
  );
  const valid = await crypto.subtle.verify(
    { name: "RSASSA-PKCS1-v1_5" },
    key,
    base64urlDecode(signature) as BufferSource,
    new TextEncoder().encode(`${header}.${payload}`)
  );
  if (!valid) throw new Error("Google token signature failed");
  const claims = jsonPart<{
    iss: string; aud: string | string[]; exp: number; sub: string; nonce?: string;
    email?: string; email_verified?: boolean | string; name?: string;
  }>(payload);
  if (claims.iss !== "https://accounts.google.com" && claims.iss !== "accounts.google.com") throw new Error("Google token issuer mismatch");
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!audiences.includes(config.clientId)) throw new Error("Google token audience mismatch");
  if (!Number.isFinite(claims.exp) || claims.exp <= nowSeconds) throw new Error("Google token expired");
  if (claims.nonce !== nonce) throw new Error("Google token nonce mismatch");
  if (typeof claims.sub !== "string" || !claims.sub) throw new Error("Google token has no subject");
  return {
    sub: claims.sub,
    email: claims.email ?? null,
    emailVerified: claims.email_verified === true || claims.email_verified === "true",
    name: claims.name?.slice(0, 80) ?? null,
  };
}

/** Swaps Google's code for its ID token and checks it. */
export async function exchangeGoogleCode(
  config: GoogleConfig,
  flow: Pick<OAuthFlowRow, "code_verifier" | "origin" | "nonce">,
  code: string,
  fetcher: typeof fetch = fetch
): Promise<GoogleIdentity> {
  const response = await fetcher("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      code_verifier: flow.code_verifier,
      grant_type: "authorization_code",
      redirect_uri: flow.origin + GOOGLE_CALLBACK,
    }).toString(),
  });
  if (!response.ok) throw new Error(`Google code exchange failed (${response.status})`);
  const body = await response.json() as { id_token?: string };
  if (!body.id_token) throw new Error("Google returned no ID token");
  return verifyGoogleIdToken(body.id_token, config, flow.nonce, fetcher);
}
