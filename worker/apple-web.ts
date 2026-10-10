import { decryptAppleRefreshToken, encryptAppleRefreshToken, resolveAppleServerConfig } from "./apple-oauth";
import { randomOpaqueToken } from "./crypto";
import type { Env } from "./types";

export const APPLE_WEB_CALLBACK = "/api/v2/auth/apple/web/callback";
export const APPLE_WEB_FLOW_COOKIE = "__Host-psapple";
const FLOW_TTL_SECONDS = 10 * 60;
const FLOW_PURPOSE = "pinkslip:apple-web-login:v1";
const ORIGINS = new Set(["https://pinkslip.work", "https://pinkslip.alip.dev"]);

export interface AppleWebFlow {
  state: string;
  nonce: string;
  sessionId: string;
  origin: string;
  clientId: string;
  accessGrant: string | null;
  expiresAt: number;
}

export function appleWebConfig(env: Env) {
  const id = env.APPLE_WEB_CLIENT_ID?.trim();
  return id ? resolveAppleServerConfig(env, id) : null;
}

export function appleFlowCookie(value: string, clear = false): string {
  // Apple returns a cross-site form POST, which doesn't carry Lax cookies.
  // __Host- also prevents a sibling domain planting this login cookie.
  return `${APPLE_WEB_FLOW_COOKIE}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=${clear ? 0 : FLOW_TTL_SECONDS}`;
}

export async function startAppleWebFlow(env: Env, sessionId: string, origin: string, accessGrant: string | null) {
  const config = appleWebConfig(env);
  if (!config || !ORIGINS.has(origin)) throw new Error("Apple web sign-in is not configured for this origin");
  const flow: AppleWebFlow = { state: randomOpaqueToken(32), nonce: randomOpaqueToken(32), sessionId,
    origin, clientId: config.clientId, accessGrant, expiresAt: Date.now() + FLOW_TTL_SECONDS * 1000 };
  const encrypted = await encryptAppleRefreshToken(JSON.stringify(flow), FLOW_PURPOSE, config.encryptionKey);
  const authorization = new URL("https://appleid.apple.com/auth/authorize");
  authorization.search = new URLSearchParams({ client_id: config.clientId, redirect_uri: origin + APPLE_WEB_CALLBACK,
    response_type: "code id_token", response_mode: "form_post", scope: "name email", state: flow.state, nonce: flow.nonce }).toString();
  return { cookie: appleFlowCookie(encrypted), authorization: authorization.toString() };
}

export async function readAppleWebFlow(env: Env, cookieHeader: string | undefined, state: string, origin: string): Promise<AppleWebFlow> {
  const config = appleWebConfig(env);
  const match = cookieHeader?.match(/(?:^|;\s*)__Host-psapple=([^;]+)/);
  if (!config || !match || state.length > 256) throw new Error("Missing Apple login flow");
  const flow = JSON.parse(await decryptAppleRefreshToken(decodeURIComponent(match[1]!), FLOW_PURPOSE, config.encryptionKey)) as AppleWebFlow;
  if (!flow || flow.state !== state || !state || flow.origin !== origin || !ORIGINS.has(origin)
    || flow.clientId !== config.clientId || typeof flow.sessionId !== "string" || !flow.sessionId
    || typeof flow.nonce !== "string" || !flow.nonce || !Number.isFinite(flow.expiresAt)
    || flow.expiresAt <= Date.now() || flow.expiresAt > Date.now() + FLOW_TTL_SECONDS * 1000) {
    throw new Error("Invalid or expired Apple login flow");
  }
  return flow;
}
