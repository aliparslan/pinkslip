import { CATALOG_READER_ID } from "./catalog-reader";
import { createMiddleware } from "hono/factory";
import type {
  AuthIdentityRow,
  AuthSessionRow,
  Env,
  UserRow,
  Variables,
} from "./types";
import { randomOpaqueToken, sha256Hex } from "./crypto";

export const COOKIE_NAMES = {
  session: "psid",
  access: "psaccess",
} as const;

const COOKIE_MAX_AGE = 60 * 60 * 24 * 365 * 2;
export const ACCESS_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;
const SESSION_TTL_MS = COOKIE_MAX_AGE * 1000;
export const AUTH_ACTIVITY_WRITE_INTERVAL_MS = 60 * 60 * 1000;
const API_TOKEN_STORAGE_PREFIX = "sha256:v1:";

function parseCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  const match = header.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  const rawValue = match?.[1];
  if (!rawValue) return undefined;
  try {
    return decodeURIComponent(rawValue);
  } catch {
    return rawValue;
  }
}

export function buildCookie(
  name: string,
  value: string,
  requestUrl: string,
  maxAge = COOKIE_MAX_AGE
): string {
  const secure = new URL(requestUrl).protocol === "https:";
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? "; Secure" : ""}`;
}

export function parseBearerToken(header: string | undefined): string | undefined {
  if (!header) return undefined;
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || undefined;
}

export function generateApiToken(): string {
  return randomOpaqueToken(32);
}

/**
 * API tokens are random 256-bit bearer credentials, so a one-way SHA-256
 * storage key prevents a database read from immediately becoming account
 * access without creating a practical offline-guessing risk.
 */
export async function apiTokenStorageKey(rawToken: string): Promise<string> {
  return `${API_TOKEN_STORAGE_PREFIX}${await sha256Hex(`pinkslip-api-token:${rawToken}`)}`;
}

export function isApiTokenStorageKey(value: string): boolean {
  return /^sha256:v1:[0-9a-f]{64}$/.test(value);
}

function isLegacyApiTokenCandidate(value: string): boolean {
  // randomOpaqueToken() is base64url. In particular, it can never contain the
  // ':' separators used by storage keys, so a leaked digest is not itself a
  // usable bearer credential during the backwards-compatibility window.
  return /^[A-Za-z0-9_-]{1,256}$/.test(value);
}

export function shouldRecordAuthActivity(
  previousTimestamp: string | null,
  nowMs = Date.now()
): boolean {
  if (!previousTimestamp) return true;
  const previousMs = Date.parse(previousTimestamp);
  return !Number.isFinite(previousMs)
    || nowMs - previousMs >= AUTH_ACTIVITY_WRITE_INTERVAL_MS;
}

function generateSessionId(): string {
  return randomOpaqueToken(32);
}

export async function accessGrantValue(accessCode: string): Promise<string> {
  return sha256Hex(`pinkslip-access:${accessCode}`);
}

async function ensureUserExists(db: D1Database, userId: string) {
  await db.prepare(
    "INSERT INTO users (id) VALUES (?) ON CONFLICT (id) DO NOTHING"
  ).bind(userId).run();
}

async function getUserRole(
  db: D1Database,
  userId: string
): Promise<UserRow["role"]> {
  const row = await db.prepare(
    "SELECT role FROM users WHERE id = ? LIMIT 1"
  ).bind(userId).first<Pick<UserRow, "role">>();
  return row?.role === "admin" ? "admin" : "user";
}

export async function isAdminUser(
  db: D1Database,
  userId: string,
  sessionState: Variables["sessionState"]
): Promise<boolean> {
  return sessionState === "authenticated"
    && await getUserRole(db, userId) === "admin";
}

export const requireAuthenticated = createMiddleware<{
  Bindings: Env;
  Variables: Variables;
}>(async (c, next) => {
  if (c.get("sessionState") !== "authenticated") {
    return c.json(
      { error: "Sign in required", code: "authentication_required" },
      401
    );
  }
  await next();
});

export const requireAdmin = createMiddleware<{
  Bindings: Env;
  Variables: Variables;
}>(async (c, next) => {
  if (!(await isAdminUser(
    c.env.DB,
    c.get("userId"),
    c.get("sessionState")
  ))) {
    return c.json(
      { error: "Admin access required", code: "admin_required" },
      403
    );
  }
  await next();
});

async function loadActiveSession(
  db: D1Database,
  sessionId: string
): Promise<AuthSessionRow | null> {
  const nowMs = Date.now();
  const now = new Date(nowMs).toISOString();
  const row = await db.prepare(
    `SELECT id, user_id, state, created_at, expires_at, revoked_at, last_seen_at
     FROM auth_sessions
     WHERE id = ?
       AND revoked_at IS NULL
       AND datetime(expires_at) > datetime(?)`
  ).bind(sessionId, now).first<AuthSessionRow>();

  if (!row) return null;

  if (shouldRecordAuthActivity(row.last_seen_at, nowMs)) {
    await db.prepare(
      "UPDATE auth_sessions SET last_seen_at = ? WHERE id = ?"
    ).bind(now, sessionId).run().catch(() => undefined);
  }

  return row;
}

async function createSession(
  db: D1Database,
  userId: string,
  state: "guest" | "authenticated"
): Promise<AuthSessionRow> {
  await ensureUserExists(db, userId);
  const now = new Date();
  const row: AuthSessionRow = {
    id: generateSessionId(),
    user_id: userId,
    state,
    created_at: now.toISOString(),
    expires_at: new Date(now.getTime() + SESSION_TTL_MS).toISOString(),
    revoked_at: null,
    last_seen_at: now.toISOString(),
  };

  await db.prepare(
    `INSERT INTO auth_sessions (id, user_id, state, created_at, expires_at, revoked_at, last_seen_at)
     VALUES (?, ?, ?, ?, ?, NULL, ?)`
  ).bind(
    row.id,
    row.user_id,
    row.state,
    row.created_at,
    row.expires_at,
    row.last_seen_at
  ).run();

  return row;
}

async function revokeSession(db: D1Database, sessionId: string | null | undefined) {
  if (!sessionId) return;
  await db.prepare(
    "UPDATE auth_sessions SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL"
  ).bind(new Date().toISOString(), sessionId).run();
}

export async function revokeApiTokensForUser(db: D1Database, userId: string) {
  await db.prepare("DELETE FROM api_tokens WHERE user_id = ?").bind(userId).run();
}

export async function getPrimaryIdentity(
  db: D1Database,
  userId: string
): Promise<AuthIdentityRow | null> {
  return db.prepare(
    `SELECT id, user_id, provider, provider_subject, email, email_verified, created_at, last_used_at
     FROM auth_identities
     WHERE user_id = ?
     ORDER BY CASE provider WHEN 'apple' THEN 0 ELSE 1 END, datetime(created_at) ASC
     LIMIT 1`
  ).bind(userId).first<AuthIdentityRow>();
}

export async function countIdentitiesForUser(db: D1Database, userId: string): Promise<number> {
  const row = await db.prepare(
    "SELECT COUNT(*) AS count FROM auth_identities WHERE user_id = ?"
  ).bind(userId).first<{ count: number }>();
  return row?.count ?? 0;
}

export async function createGuestSession(
  db: D1Database,
  userId = crypto.randomUUID()
): Promise<AuthSessionRow> {
  return createSession(db, userId, "guest");
}

export async function replaceSession(
  db: D1Database,
  currentSessionId: string | null,
  userId: string,
  state: "guest" | "authenticated"
): Promise<AuthSessionRow> {
  if (currentSessionId) {
    await revokeSession(db, currentSessionId);
  }
  return createSession(db, userId, state);
}

async function resolveBearerUser(db: D1Database, bearer: string): Promise<string | null> {
  const storageKey = await apiTokenStorageKey(bearer);
  type ApiTokenLookupRow = { user_id: string; last_used_at: string | null };

  let matchedToken = storageKey;
  let row = await db.prepare(
    "SELECT user_id, last_used_at FROM api_tokens WHERE token = ?"
  ).bind(storageKey).first<ApiTokenLookupRow>();

  // Existing rows were historically stored as raw base64url tokens. Keep them
  // working, but only accept the old raw-token alphabet so a leaked prefixed
  // storage digest can never be replayed as a bearer credential.
  if (!row && isLegacyApiTokenCandidate(bearer)) {
    matchedToken = bearer;
    row = await db.prepare(
      "SELECT user_id, last_used_at FROM api_tokens WHERE token = ?"
    ).bind(bearer).first<ApiTokenLookupRow>();
  }

  if (!row?.user_id) return null;

  const nowMs = Date.now();
  const now = new Date(nowMs).toISOString();
  if (matchedToken === bearer) {
    // Lazily remove legacy plaintext credentials as they are used. Updating the
    // primary key is safe because no table references api_tokens.token.
    await db.prepare(
      "UPDATE api_tokens SET token = ?, last_used_at = ? WHERE token = ?"
    ).bind(storageKey, now, bearer).run().catch(() => undefined);
  } else if (shouldRecordAuthActivity(row.last_used_at, nowMs)) {
    await db.prepare(
      "UPDATE api_tokens SET last_used_at = ? WHERE token = ?"
    ).bind(now, storageKey).run().catch(() => undefined);
  }
  return row.user_id;
}

export const authMiddleware = createMiddleware<{ Bindings: Env; Variables: Variables }>(
  async (c, next) => {
    const pathname = new URL(c.req.url).pathname;
    if (pathname === "/api/v2/access" || pathname === "/api/v2/health") {
      await next();
      return;
    }

    const bearer = parseBearerToken(c.req.header("authorization"));
    if (bearer) {
      const nativeSession = await loadActiveSession(c.env.DB, bearer);
      if (nativeSession) {
        c.set("userId", nativeSession.user_id);
        c.set("sessionId", nativeSession.id);
        c.set("sessionState", nativeSession.state);
        c.set("authTransport", "native");
        await next();
        return;
      }

      const bearerUserId = await resolveBearerUser(c.env.DB, bearer);
      if (!bearerUserId) {
        return c.json({ error: "Invalid token", code: "invalid_token" }, 401);
      }
      // A bearer token only represents an authenticated account if the user
      // actually has a sign-in identity. This rejects any token minted while the
      // user was still a guest, which would otherwise be silently elevated to
      // "authenticated" and bypass every requireAuthenticated guard.
      if ((await countIdentitiesForUser(c.env.DB, bearerUserId)) === 0) {
        return c.json({ error: "Invalid token", code: "invalid_token" }, 401);
      }
      c.set("userId", bearerUserId);
      c.set("sessionId", null);
      c.set("sessionState", "authenticated");
      c.set("authTransport", "api_token");
      await next();
      return;
    }

    const cookieHeader = c.req.header("cookie");
    const accessCode = c.env.ACCESS_CODE?.trim();

    if (accessCode) {
      const grantedCode = parseCookie(cookieHeader, COOKIE_NAMES.access);
      if (grantedCode !== await accessGrantValue(accessCode)) {
        return c.json({ error: "Access required", code: "access_required" }, 401);
      }
    }

    const rawSessionCookie = parseCookie(cookieHeader, COOKIE_NAMES.session);
    let session = rawSessionCookie
      ? await loadActiveSession(c.env.DB, rawSessionCookie)
      : null;

    if (!session) {
      if (
        !["GET", "HEAD", "OPTIONS"].includes(c.req.method)
        || pathname === "/auth/email/verify"
      ) {
        // A visitor becomes a guest only on their first state-changing action.
        // Passive page loads, crawlers, previews, and health checks must not turn
        // into permanent users and sessions in D1.
        session = await createGuestSession(c.env.DB);
      }

      if (session) {
        c.header(
          "Set-Cookie",
          buildCookie(COOKIE_NAMES.session, session.id, c.req.url),
          { append: true }
        );
      }
    }

    if (!session) {
      const anonymousReads = new Set([
        "/api/v2/bootstrap",
        "/api/v2/me",
        "/api/v2/preferences",
        "/api/v2/logo",
        "/api/v2/stats",
        "/api/v2/jobs",
      ]);
      if (!anonymousReads.has(pathname)) {
        return c.json(
          { error: "Start a session before using this feature", code: "session_required" },
          401
        );
      }
      // The feed list reads as the built-in catalog account (a new guest's
      // defaults); everything else stays userless. Writes never get here:
      // they create a guest session above.
      c.set("userId", pathname === "/api/v2/jobs" ? CATALOG_READER_ID : "");
      c.set("sessionId", null);
      c.set("sessionState", "anonymous");
      c.set("authTransport", "anonymous");
      await next();
      return;
    }

    c.set("userId", session.user_id);
    c.set("sessionId", session.id);
    c.set("sessionState", session.state);
    c.set("authTransport", "cookie");

    await next();
  }
);
