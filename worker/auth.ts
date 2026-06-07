import { createMiddleware } from "hono/factory";
import type {
  AuthIdentityRow,
  AuthSessionRow,
  Env,
  UserRow,
  Variables,
} from "./types";
import { randomOpaqueToken } from "./crypto";

export const COOKIE_NAMES = {
  session: "psid",
  access: "psaccess",
} as const;

const COOKIE_MAX_AGE = 60 * 60 * 24 * 365 * 2;
const SESSION_TTL_MS = COOKIE_MAX_AGE * 1000;

export function parseCookie(header: string | undefined, name: string): string | undefined {
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

export function buildClearedCookie(name: string, requestUrl: string): string {
  const secure = new URL(requestUrl).protocol === "https:";
  return `${name}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? "; Secure" : ""}`;
}

export function parseBearerToken(header: string | undefined): string | undefined {
  if (!header) return undefined;
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || undefined;
}

export function generateApiToken(): string {
  return randomOpaqueToken(32);
}

export function generateSessionId(): string {
  return randomOpaqueToken(32);
}

export async function ensureUserExists(db: D1Database, userId: string) {
  await db.prepare(
    "INSERT INTO users (id) VALUES (?) ON CONFLICT (id) DO NOTHING"
  ).bind(userId).run();
}

export async function getUserRole(
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

export async function loadActiveSession(
  db: D1Database,
  sessionId: string
): Promise<AuthSessionRow | null> {
  const now = new Date().toISOString();
  const row = await db.prepare(
    `SELECT id, user_id, state, created_at, expires_at, revoked_at, last_seen_at
     FROM auth_sessions
     WHERE id = ?
       AND revoked_at IS NULL
       AND datetime(expires_at) > datetime(?)`
  ).bind(sessionId, now).first<AuthSessionRow>();

  if (!row) return null;

  await db.prepare(
    "UPDATE auth_sessions SET last_seen_at = ? WHERE id = ?"
  ).bind(now, sessionId).run().catch(() => undefined);

  return row;
}

export async function createSession(
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

export async function revokeSession(db: D1Database, sessionId: string | null | undefined) {
  if (!sessionId) return;
  await db.prepare(
    "UPDATE auth_sessions SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL"
  ).bind(new Date().toISOString(), sessionId).run();
}

export async function revokeAllSessionsForUser(db: D1Database, userId: string) {
  await db.prepare(
    "UPDATE auth_sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL"
  ).bind(new Date().toISOString(), userId).run();
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
  const row = await db.prepare(
    "SELECT user_id FROM api_tokens WHERE token = ?"
  ).bind(bearer).first<{ user_id: string }>();
  if (!row?.user_id) return null;
  await db.prepare(
    "UPDATE api_tokens SET last_used_at = ? WHERE token = ?"
  ).bind(new Date().toISOString(), bearer).run().catch(() => undefined);
  return row.user_id;
}

async function loadLegacyUserIfPresent(
  db: D1Database,
  cookieValue: string | undefined
): Promise<string | null> {
  if (!cookieValue) return null;
  const row = await db.prepare(
    "SELECT id FROM users WHERE id = ? LIMIT 1"
  ).bind(cookieValue).first<{ id: string }>();
  return row?.id ?? null;
}

export const authMiddleware = createMiddleware<{ Bindings: Env; Variables: Variables }>(
  async (c, next) => {
    const pathname = new URL(c.req.url).pathname;
    if (pathname === "/api/access" || pathname === "/api/health") {
      await next();
      return;
    }

    const bearer = parseBearerToken(c.req.header("authorization"));
    if (bearer) {
      const bearerUserId = await resolveBearerUser(c.env.DB, bearer);
      if (!bearerUserId) {
        return c.json({ error: "Invalid token", code: "invalid_token" }, 401);
      }
      c.set("userId", bearerUserId);
      c.set("sessionId", null);
      c.set("sessionState", "authenticated");
      await next();
      return;
    }

    const cookieHeader = c.req.header("cookie");
    const accessCode = c.env.ACCESS_CODE?.trim();

    if (accessCode) {
      const grantedCode = parseCookie(cookieHeader, COOKIE_NAMES.access);
      if (grantedCode !== accessCode) {
        return c.json({ error: "Access required", code: "access_required" }, 401);
      }
    }

    const rawSessionCookie = parseCookie(cookieHeader, COOKIE_NAMES.session);
    let session = rawSessionCookie
      ? await loadActiveSession(c.env.DB, rawSessionCookie)
      : null;

    if (!session) {
      const legacyUserId = await loadLegacyUserIfPresent(c.env.DB, rawSessionCookie);
      if (legacyUserId) {
        session = await createGuestSession(c.env.DB, legacyUserId);
      } else {
        session = await createGuestSession(c.env.DB);
      }

      c.header(
        "Set-Cookie",
        buildCookie(COOKIE_NAMES.session, session.id, c.req.url),
        { append: true }
      );
    }

    c.set("userId", session.user_id);
    c.set("sessionId", session.id);
    c.set("sessionState", session.state);

    await next();
  }
);
