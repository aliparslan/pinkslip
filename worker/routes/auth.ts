import { Hono } from "hono";
import {
  deleteUserAccountData,
  mergeGuestDataIntoAccount,
  normalizeEmail,
} from "../account";
import { verifyAppleIdentityToken } from "../apple";
import { APPLE_WEB_CALLBACK, appleFlowCookie, appleWebConfig, readAppleWebFlow, startAppleWebFlow } from "../apple-web";
import {
  exchangeAppleAuthorizationCode,
  resolveAppleServerConfig,
  revokeAppleAuthorizationForUser,
  storeAppleRefreshToken,
} from "../apple-oauth";
import {
  buildCookie,
  accessGrantValue,
  COOKIE_NAMES,
  apiTokenStorageKey,
  countIdentitiesForUser,
  createGuestSession,
  generateApiToken,
  getPrimaryIdentity,
  isApiTokenStorageKey,
  loadActiveSession,
  parseCookie,
  replaceSession,
  requireAuthenticated,
  revokeApiTokensForUser,
} from "../auth";
import { randomOpaqueToken, sha256Hex } from "../crypto";
import { sendMagicLinkEmail, sendSignInCodeEmail } from "../email";
import {
  allowedGoogleOrigin,
  consumeGoogleFlow,
  exchangeGoogleCode,
  googleConfig,
  loadGoogleFlow,
  startGoogleFlow,
  type GoogleIdentity,
} from "../google";
import { hashPassword, PASSWORD_MAX_LENGTH, passwordProblem, verifyPassword } from "../passwords";
import { recordProductEvent } from "../product-events";
import { ArtifactStorageUnavailableError } from "../tailor/artifact-storage";
import type { AuthIdentityRow, Env, UserRow, Variables } from "../types";

const auth = new Hono<{ Bindings: Env; Variables: Variables }>();

auth.post("/apple/web/start", async (c) => {
  c.header("Cache-Control", "no-store");
  const origin = new URL(c.req.url).origin;
  if (c.req.header("origin") !== origin || c.get("authTransport") !== "cookie") {
    return c.json({ error: "Start Apple sign-in from Account on this website." }, 403);
  }
  if (c.get("sessionState") === "authenticated") return c.redirect("/you/account", 303);
  const sessionId = c.get("sessionId");
  if (!sessionId || !appleWebConfig(c.env)) return c.redirect("/you/account?apple=unavailable", 303);
  try {
    const grant = c.env.ACCESS_CODE?.trim() ? await accessGrantValue(c.env.ACCESS_CODE.trim()) : null;
    const flow = await startAppleWebFlow(c.env, sessionId, origin, grant);
    c.header("Set-Cookie", flow.cookie, { append: true });
    return c.redirect(flow.authorization, 303);
  } catch { return c.redirect("/you/account?apple=unavailable", 303); }
});

auth.post("/apple/web/callback", async (c) => {
  c.header("Cache-Control", "no-store");
  c.header("Set-Cookie", appleFlowCookie("", true), { append: true });
  try {
    if (!c.req.header("content-type")?.startsWith("application/x-www-form-urlencoded")) throw new Error("Invalid Apple callback");
    const body = new URLSearchParams(await c.req.text());
    const origin = new URL(c.req.url).origin;
    const flow = await readAppleWebFlow(c.env, c.req.header("cookie"), body.get("state") ?? "", origin);
    const grant = c.env.ACCESS_CODE?.trim() ? await accessGrantValue(c.env.ACCESS_CODE.trim()) : null;
    if (flow.accessGrant !== grant) throw new Error("Access changed during sign-in");
    const original = await loadActiveSession(c.env.DB, flow.sessionId);
    if (!original || original.state !== "guest") throw new Error("Session changed during sign-in");
    if (body.get("error") === "user_cancelled_authorize") return c.redirect("/you/account?apple=cancelled", 303);
    const code = body.get("code");
    const token = body.get("id_token");
    const config = appleWebConfig(c.env);
    if (!config || !code || !token || body.has("error")) throw new Error("Incomplete Apple sign-in");
    const verified = await verifyAppleIdentityToken(c.env, token, flow.nonce, flow.clientId);
    const exchange = await exchangeAppleAuthorizationCode(config, code, undefined, origin + APPLE_WEB_CALLBACK);
    const exchanged = await verifyAppleIdentityToken(c.env, exchange.id_token, flow.nonce, flow.clientId);
    if (typeof verified.sub !== "string" || !verified.sub || exchanged.sub !== verified.sub) throw new Error("Apple account mismatch");
    if (!(await loadActiveSession(c.env.DB, original.id))) throw new Error("Session ended during sign-in");
    c.set("userId", original.user_id);
    c.set("sessionId", original.id);
    c.set("sessionState", original.state);
    c.set("authTransport", "cookie");
    let fullName: string | null = null;
    // The name is a display preference. The email and account identifier are
    // accepted only from Apple's verified token, never its user form field.
    try {
      const user = JSON.parse(body.get("user") ?? "null") as { name?: { firstName?: string; lastName?: string } } | null;
      fullName = [user?.name?.firstName, user?.name?.lastName].filter((part) => typeof part === "string").join(" ").slice(0, 80) || null;
    } catch { /* Apple supplies user only on first consent. */ }
    await signInWithIdentity(c, { provider: "apple", providerSubject: verified.sub,
      email: verified.email ?? null, emailVerified: verified.email_verified === true || verified.email_verified === "true", fullName,
      afterIdentity: ({ id, userId }) => storeAppleRefreshToken(c.env.DB, config, id, userId, exchange.refresh_token) });
    return c.redirect("/you/account?apple=success", 303);
  } catch {
    // Do not expose or log Apple's identity token, code, or relay address.
    return c.redirect("/you/account?apple=error", 303);
  }
});

async function loadUser(db: D1Database, userId: string) {
  return db.prepare(
    "SELECT id, name, role, created_at FROM users WHERE id = ?"
  ).bind(userId).first<UserRow>();
}

async function findIdentityByProviderSubject(
  db: D1Database,
  provider: "apple" | "email" | "google",
  providerSubject: string
) {
  return db.prepare(
    `SELECT id, user_id, provider, provider_subject, email, email_verified, created_at, last_used_at
     FROM auth_identities
     WHERE provider = ? AND provider_subject = ?
     LIMIT 1`
  ).bind(provider, providerSubject).first<AuthIdentityRow>();
}

/** The account an email already belongs to. Only a verified email joins
 * accounts (Decisions: Accounts #3); an Apple relay address only matches
 * itself, so "Hide my email" stays separate unless linked. */
async function findIdentityByEmail(db: D1Database, email: string) {
  return db.prepare(
    `SELECT id, user_id, provider, provider_subject, email, email_verified, created_at, last_used_at
     FROM auth_identities
     WHERE lower(email) = lower(?) AND email_verified = 1
     ORDER BY datetime(created_at) ASC
     LIMIT 1`
  ).bind(email).first<AuthIdentityRow>();
}

async function updateUserNameIfBlank(db: D1Database, userId: string, suggestedName?: string | null) {
  const trimmed = suggestedName?.trim();
  if (!trimmed) return;
  const user = await loadUser(db, userId);
  if (!user || user.name.trim()) return;
  await db.prepare("UPDATE users SET name = ? WHERE id = ?").bind(trimmed, userId).run();
}

export async function buildAccountState(
  db: D1Database,
  userId: string,
  sessionState: Variables["sessionState"]
) {
  const user = sessionState === "anonymous" ? null : await loadUser(db, userId);
  if (!user) {
    return {
      user: null,
      session: { state: sessionState },
      is_admin: false,
      account: sessionState === "authenticated"
        ? { authenticated: true, email: null, providers: [] as string[] }
        : null,
    };
  }

  if (sessionState !== "authenticated") {
    return {
      user,
      session: { state: sessionState },
      is_admin: false,
      account: null,
    };
  }

  const [primaryIdentity, identityCount, methods] = await Promise.all([
    getPrimaryIdentity(db, userId),
    countIdentitiesForUser(db, userId),
    db.prepare(
      `SELECT DISTINCT provider, MAX(password_hash IS NOT NULL) AS has_password
       FROM auth_identities WHERE user_id = ? GROUP BY provider`
    ).bind(userId).all<{ provider: string; has_password: number }>(),
  ]);
  const providers = (methods.results ?? []).map((row) => row.provider);

  return {
    user,
    session: { state: sessionState },
    is_admin: user.role === "admin",
    account: {
      authenticated: true,
      email: primaryIdentity?.email ?? null,
      provider: primaryIdentity?.provider ?? null,
      // Every way this account signs in; the primary one first.
      providers: primaryIdentity
        ? [primaryIdentity.provider, ...providers.filter((provider) => provider !== primaryIdentity.provider)]
        : providers,
      has_password: (methods.results ?? []).some((row) => row.has_password === 1),
      identity_count: identityCount,
    },
  };
}

async function signInWithIdentity(
  c: {
    env: Env;
    req: { url: string };
    get(key: "userId" | "sessionId" | "sessionState" | "authTransport"): string | null;
    set(key: "userId" | "sessionId" | "sessionState", value: string): void;
    header(name: string, value: string, options?: { append?: boolean }): void;
  },
  args: {
    provider: "apple" | "email" | "google";
    providerSubject: string;
    email?: string | null;
    emailVerified?: boolean;
    fullName?: string | null;
    afterIdentity?: (identity: { id: string; userId: string }) => Promise<void>;
  }
) {
  const now = new Date().toISOString();
  const db = c.env.DB as D1Database;
  const currentUserId = c.get("userId") as string;
  const currentSessionId = c.get("sessionId") as string | null;
  const normalizedEmail = args.email ? normalizeEmail(args.email) : null;

  const directIdentity = await findIdentityByProviderSubject(db, args.provider, args.providerSubject);
  // Only auto-link to an existing account by email when the provider asserts the
  // email is verified. Linking on an unverified/attacker-supplied address would
  // allow taking over another user's account.
  const linkedIdentity = !directIdentity && normalizedEmail && args.emailVerified
    ? await findIdentityByEmail(db, normalizedEmail)
    : null;

  const targetUserId = directIdentity?.user_id ?? linkedIdentity?.user_id ?? currentUserId;
  const createdAccount = !directIdentity && !linkedIdentity;

  if ((directIdentity || linkedIdentity) && currentUserId !== targetUserId) {
    await mergeGuestDataIntoAccount(db, {
      sourceUserId: currentUserId,
      targetUserId,
      sourceLabel: `guest import ${now}`,
    });
  }

  const identityId = directIdentity?.id ?? crypto.randomUUID();
  if (!directIdentity) {
    await db.prepare(
      `INSERT INTO auth_identities (
         id, user_id, provider, provider_subject, email, email_verified, created_at, last_used_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      identityId,
      targetUserId,
      args.provider,
      args.providerSubject,
      normalizedEmail,
      args.emailVerified ? 1 : 0,
      now,
      now
    ).run();
  } else {
    await db.prepare(
      `UPDATE auth_identities
       SET email = COALESCE(?, email),
           email_verified = CASE WHEN ? = 1 THEN 1 ELSE email_verified END,
           last_used_at = ?
       WHERE id = ?`
    ).bind(
      normalizedEmail,
      args.emailVerified ? 1 : 0,
      now,
      directIdentity.id
    ).run();
  }

  await args.afterIdentity?.({ id: identityId, userId: targetUserId });
  await updateUserNameIfBlank(db, targetUserId, args.fullName);
  await revokeApiTokensForUser(db, targetUserId);
  const nextSession = await replaceSession(db, currentSessionId, targetUserId, "authenticated");
  c.header(
    "Set-Cookie",
    buildCookie(COOKIE_NAMES.session, nextSession.id, c.req.url),
    { append: true }
  );

  c.set("userId", targetUserId);
  c.set("sessionId", nextSession.id);
  c.set("sessionState", "authenticated");
  if (createdAccount) {
    await recordProductEvent(db, {
      userId: targetUserId,
      sessionId: nextSession.id,
      name: "account_created",
      entityType: "account",
      properties: { provider: args.provider },
    }).catch(() => undefined);
  }
  return nextSession;
}

export async function consumeEmailLoginToken(db: D1Database, rawToken: string) {
  const tokenHash = await sha256Hex(rawToken);
  const now = new Date().toISOString();
  type EmailLoginTokenRow = { id: string; email: string };

  // D1 batches are transactions: the lookup and conditional consume execute
  // sequentially without another verification interleaving between them. The
  // repeated predicates are intentional—the update's change count is the
  // compare-and-set result that decides which concurrent request won.
  const [selection, consumption] = await db.batch<EmailLoginTokenRow>([
    db.prepare(
      `SELECT id, email
       FROM email_login_tokens
       WHERE token_hash = ?
         AND consumed_at IS NULL
         AND datetime(expires_at) > datetime(?)
       LIMIT 1`
    ).bind(tokenHash, now),
    db.prepare(
      `UPDATE email_login_tokens
       SET consumed_at = ?
       WHERE token_hash = ?
         AND consumed_at IS NULL
         AND datetime(expires_at) > datetime(?)`
    ).bind(now, tokenHash, now),
  ]);

  if ((consumption.meta.changes ?? 0) !== 1) return null;
  return selection.results[0] ?? null;
}

auth.post("/token", requireAuthenticated, async (c) => {
  const userId = c.get("userId");

  const existing = await c.env.DB.prepare(
    "SELECT token FROM api_tokens WHERE user_id = ? LIMIT 1"
  ).bind(userId).first<{ token: string }>();

  if (existing?.token && !isApiTokenStorageKey(existing.token)) {
    // Migrate a legacy plaintext row before returning the same credential to
    // an older native client. Subsequent requests authenticate by its digest.
    const storageKey = await apiTokenStorageKey(existing.token);
    await c.env.DB.prepare(
      "UPDATE api_tokens SET token = ? WHERE token = ? AND user_id = ?"
    ).bind(storageKey, existing.token, userId).run();
    return c.json({ token: existing.token });
  }

  const token = generateApiToken();
  const storageKey = await apiTokenStorageKey(token);
  const now = new Date().toISOString();
  await c.env.DB.batch([
    // A digest cannot be reversed for a repeat response. Reissuing from this
    // endpoint therefore rotates any previous token for the account.
    c.env.DB.prepare("DELETE FROM api_tokens WHERE user_id = ?").bind(userId),
    c.env.DB.prepare(
      "INSERT INTO api_tokens (token, user_id, created_at) VALUES (?, ?, ?)"
    ).bind(storageKey, userId, now),
  ]);

  return c.json({ token }, 201);
});

auth.post("/apple/exchange", async (c) => {
  const body = await c.req.json<{
    identityToken?: string;
    authorizationCode?: string;
    user?: string;
    email?: string;
    fullName?: string;
    nonce?: string;
  }>().catch(() => null);

  const identityToken = body?.identityToken?.trim();
  if (!identityToken) {
    return c.json({ error: "Missing identity token" }, 400);
  }
  const nonce = body?.nonce?.trim();
  if (!nonce) {
    return c.json({ error: "Missing Apple sign-in nonce" }, 400);
  }

  const verified = await verifyAppleIdentityToken(c.env, identityToken, nonce)
    .catch((error) => {
      const message = error instanceof Error ? error.message : "Apple sign-in failed";
      return c.json({ error: message, code: "invalid_apple_token" }, 401);
    });

  if (verified instanceof Response) {
    return verified;
  }

  if (body?.user?.trim() && body.user.trim() !== verified.sub) {
    return c.json({ error: "Apple user identifier mismatch", code: "invalid_apple_token" }, 401);
  }

  const appleConfig = resolveAppleServerConfig(c.env);
  const authorizationCode = body?.authorizationCode?.trim();
  let refreshToken: string | null = null;
  if (appleConfig) {
    if (!authorizationCode) {
      return c.json({
        error: "Apple did not provide the authorization needed to finish sign-in. Try again.",
        code: "apple_authorization_code_required",
      }, 400);
    }
    try {
      const tokenResponse = await exchangeAppleAuthorizationCode(appleConfig, authorizationCode);
      const exchangedIdentity = await verifyAppleIdentityToken(c.env, tokenResponse.id_token, nonce);
      if (exchangedIdentity.sub !== verified.sub) {
        return c.json({
          error: "Apple authorization did not match this account.",
          code: "invalid_apple_token",
        }, 401);
      }
      refreshToken = tokenResponse.refresh_token;
    } catch (error) {
      console.error(JSON.stringify({
        message: "apple authorization code exchange failed",
        error: error instanceof Error ? error.message : String(error),
      }));
      return c.json({
        error: "Apple sign-in could not be completed. Try again.",
        code: "apple_authorization_exchange_failed",
      }, 502);
    }
  }

  const nextSession = await signInWithIdentity(c, {
    provider: "apple",
    providerSubject: verified.sub,
    // Trust ONLY the email inside Apple's signed identity token. The request body
    // is attacker-controlled, so using body.email here let any Apple user link to
    // (and take over) another account by submitting that account's address.
    email: verified.email || null,
    emailVerified: verified.email_verified === true || verified.email_verified === "true",
    fullName: body?.fullName?.trim() || null,
    afterIdentity: appleConfig && refreshToken
      ? ({ id, userId }) => storeAppleRefreshToken(
          c.env.DB,
          appleConfig,
          id,
          userId,
          refreshToken,
        )
      : undefined,
  });

  return c.json({
    ...await buildAccountState(c.env.DB, c.get("userId"), c.get("sessionState")),
    ...(c.get("authTransport") === "native" ? { native_token: nextSession.id } : {}),
  });
});

// Basic shape check — not full RFC 5322, just enough to reject junk before we
// pay to send anything.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

auth.post("/email/start", async (c) => {
  const body = await c.req.json<{ email?: string; redirect_uri?: string }>().catch(() => null);
  const email = normalizeEmail(body?.email ?? "");
  if (!email || email.length > 254 || !EMAIL_PATTERN.test(email)) {
    return c.json({ error: "Enter a valid email address" }, 400);
  }

  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  const requestIp = c.req.header("cf-connecting-ip")?.trim() || null;
  // On limit, succeed silently: no other email, and no hint whether an account exists.
  if (await emailSendLimited(c.env.DB, email, requestIp)) {
    return c.json({ ok: true, expires_at: expiresAt });
  }

  const rawToken = randomOpaqueToken(32);
  const tokenHash = await sha256Hex(rawToken);

  const tokenId = crypto.randomUUID();
  await c.env.DB.prepare(
    `INSERT INTO email_login_tokens (id, email, token_hash, expires_at, redirect_uri, request_ip, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    tokenId,
    email,
    tokenHash,
    expiresAt,
    body?.redirect_uri?.trim() || null,
    requestIp,
    new Date().toISOString()
  ).run();

  const verifyUrl = new URL("/auth/email/verify", c.req.url);
  verifyUrl.searchParams.set("token", rawToken);

  try {
    await sendMagicLinkEmail(c.env, {
      to: email,
      verifyUrl: verifyUrl.toString(),
    });
  } catch (error) {
    // An unsent link mustn't count toward the rate limit: otherwise the
    // retry is silently "rate limited" and reports success with no email.
    await c.env.DB.prepare("DELETE FROM email_login_tokens WHERE id = ?").bind(tokenId).run();
    console.error("Sign-in email failed to send:", error instanceof Error ? `${error.name}: ${error.message}` : error);
    return c.json({ error: "We couldn't send the email. Try again in a minute.", code: "email_unavailable" }, 503);
  }

  return c.json({ ok: true, expires_at: expiresAt });
});

auth.post("/email/verify", async (c) => {
  const body = await c.req.json<{ token?: string }>().catch(() => null);
  const token = body?.token?.trim();
  if (!token) {
    return c.json({ error: "Missing token" }, 400);
  }

  const consumed = await consumeEmailLoginToken(c.env.DB, token);
  if (!consumed) {
    return c.json({ error: "That sign-in link is invalid or expired", code: "invalid_email_token" }, 401);
  }

  const nextSession = await signInWithIdentity(c, {
    provider: "email",
    providerSubject: normalizeEmail(consumed.email),
    email: consumed.email,
    emailVerified: true,
  });

  return c.json({
    ...await buildAccountState(c.env.DB, c.get("userId"), c.get("sessionState")),
    ...(c.get("authTransport") === "native" ? { native_token: nextSession.id } : {}),
  });
});

/** Per email (one a minute, five an hour) and per address (twenty an hour),
 * across links and codes. Over the limit, starts succeed without sending. */
async function emailSendLimited(db: D1Database, email: string, requestIp: string | null): Promise<boolean> {
  const oneMinuteAgo = new Date(Date.now() - 60 * 1000).toISOString();
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const emailCounts = await db.prepare(
    `SELECT
       COUNT(*) AS last_hour,
       SUM(CASE WHEN datetime(created_at) > datetime(?) THEN 1 ELSE 0 END) AS last_minute
     FROM email_login_tokens
     WHERE email = ? AND datetime(created_at) > datetime(?)`
  ).bind(oneMinuteAgo, email, oneHourAgo).first<{ last_hour: number; last_minute: number }>();
  const ipCount = requestIp
    ? await db.prepare(
        `SELECT COUNT(*) AS last_hour FROM email_login_tokens
         WHERE request_ip = ? AND datetime(created_at) > datetime(?)`
      ).bind(requestIp, oneHourAgo).first<{ last_hour: number }>()
    : null;
  return (emailCounts?.last_minute ?? 0) >= 1 || (emailCounts?.last_hour ?? 0) >= 5 || (ipCount?.last_hour ?? 0) >= 20;
}

/** Tries a code may take before a new one is needed. */
const CODE_ATTEMPTS = 5;

function signInCode(): string {
  const value = crypto.getRandomValues(new Uint32Array(1))[0]! % 1_000_000;
  return String(value).padStart(6, "0");
}

/**
 * Sign-in by code (Decisions: Accounts #2): for signing in without a
 * password, creating an account with one, and "Forgot password?". The code
 * proves the email is theirs.
 */
auth.post("/email/code/start", async (c) => {
  const body = await c.req.json<{ email?: string }>().catch(() => null);
  const email = normalizeEmail(body?.email ?? "");
  if (!email || email.length > 254 || !EMAIL_PATTERN.test(email)) {
    return c.json({ error: "Enter a valid email address" }, 400);
  }
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  const requestIp = c.req.header("cf-connecting-ip")?.trim() || null;
  if (await emailSendLimited(c.env.DB, email, requestIp)) return c.json({ ok: true, expires_at: expiresAt });

  const code = signInCode();
  const tokenId = crypto.randomUUID();
  await c.env.DB.prepare(
    `INSERT INTO email_login_tokens (id, email, token_hash, expires_at, redirect_uri, request_ip, created_at, kind)
     VALUES (?, ?, ?, ?, NULL, ?, ?, 'code')`
  ).bind(tokenId, email, await sha256Hex(`code:${tokenId}:${code}`), expiresAt, requestIp, new Date().toISOString()).run();
  try {
    await sendSignInCodeEmail(c.env, { to: email, code });
  } catch (error) {
    await c.env.DB.prepare("DELETE FROM email_login_tokens WHERE id = ?").bind(tokenId).run();
    console.error("Sign-in code failed to send:", error instanceof Error ? `${error.name}: ${error.message}` : error);
    return c.json({ error: "The email didn't send. Try again in a minute.", code: "email_unavailable" }, 503);
  }
  return c.json({ ok: true, expires_at: expiresAt });
});

/**
 * Checks the newest code for the email and signs in, creating the account if
 * it's new or joining the one the email is on. With `password`, it also
 * sets the account's password (sign-up, or a forgotten one).
 */
auth.post("/email/code/verify", async (c) => {
  const body = await c.req.json<{ email?: string; code?: string; password?: unknown }>().catch(() => null);
  const email = normalizeEmail(body?.email ?? "");
  const code = (body?.code ?? "").replace(/\s+/g, "");
  if (!email || !/^\d{6}$/.test(code)) return c.json({ error: "Enter the 6-digit code", code: "invalid_code" }, 400);
  if (body?.password !== undefined) {
    const problem = passwordProblem(body.password);
    if (problem) return c.json({ error: problem, code: "weak_password" }, 400);
  }
  const now = new Date().toISOString();
  const row = await c.env.DB.prepare(
    `SELECT id, token_hash, attempts FROM email_login_tokens
     WHERE email = ? AND kind = 'code' AND consumed_at IS NULL AND datetime(expires_at) > datetime(?)
     ORDER BY datetime(created_at) DESC LIMIT 1`
  ).bind(email, now).first<{ id: string; token_hash: string; attempts: number }>();
  if (!row || row.attempts >= CODE_ATTEMPTS) {
    return c.json({ error: "That code expired. Ask for a new one.", code: "expired_code" }, 401);
  }
  if ((await sha256Hex(`code:${row.id}:${code}`)) !== row.token_hash) {
    await c.env.DB.prepare("UPDATE email_login_tokens SET attempts = attempts + 1 WHERE id = ?").bind(row.id).run();
    return c.json({ error: "That code isn't right", code: "wrong_code" }, 401);
  }
  const consumed = await c.env.DB.prepare(
    "UPDATE email_login_tokens SET consumed_at = ? WHERE id = ? AND consumed_at IS NULL"
  ).bind(now, row.id).run();
  if (!consumed.meta.changes) return c.json({ error: "That code expired. Ask for a new one.", code: "expired_code" }, 401);

  const nextSession = await signInWithIdentity(c, { provider: "email", providerSubject: email, email, emailVerified: true });
  if (typeof body?.password === "string") {
    await c.env.DB.prepare(
      `UPDATE auth_identities SET password_hash = ?, password_updated_at = ?
       WHERE user_id = ? AND provider = 'email' AND provider_subject = ?`
    ).bind(await hashPassword(body.password), now, c.get("userId"), email).run();
  }
  return c.json({
    ...await buildAccountState(c.env.DB, c.get("userId"), c.get("sessionState")),
    ...(c.get("authTransport") === "native" ? { native_token: nextSession.id } : {}),
  });
});

/** Email and password. One answer for a wrong email or password, so it
 * doesn't say who has an account; ten misses in 15 minutes pause an email. */
auth.post("/password/login", async (c) => {
  const body = await c.req.json<{ email?: string; password?: unknown }>().catch(() => null);
  const email = normalizeEmail(body?.email ?? "");
  const password = typeof body?.password === "string" ? body.password : "";
  if (!email || !password || password.length > PASSWORD_MAX_LENGTH) {
    return c.json({ error: "Enter your email and password" }, 400);
  }
  const requestIp = c.req.header("cf-connecting-ip")?.trim() || null;
  const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const misses = await c.env.DB.prepare(
    `SELECT
       (SELECT COUNT(*) FROM password_attempts WHERE email = ? AND attempted_at > ?) AS by_email,
       (SELECT COUNT(*) FROM password_attempts WHERE request_ip = ? AND attempted_at > ?) AS by_ip`
  ).bind(email, since, requestIp, since).first<{ by_email: number; by_ip: number }>();
  if ((misses?.by_email ?? 0) >= 10 || (requestIp && (misses?.by_ip ?? 0) >= 30)) {
    return c.json({ error: "Too many tries. Wait a few minutes, or sign in with a code.", code: "password_rate_limited" }, 429);
  }
  const identity = await c.env.DB.prepare(
    "SELECT password_hash FROM auth_identities WHERE provider = 'email' AND provider_subject = ? AND password_hash IS NOT NULL"
  ).bind(email).first<{ password_hash: string }>();
  if (!identity || !(await verifyPassword(password, identity.password_hash))) {
    await c.env.DB.prepare("INSERT INTO password_attempts (id, email, request_ip, attempted_at) VALUES (?, ?, ?, ?)")
      .bind(crypto.randomUUID(), email, requestIp, new Date().toISOString()).run();
    return c.json({ error: "That email and password don't match", code: "wrong_password" }, 401);
  }
  const nextSession = await signInWithIdentity(c, { provider: "email", providerSubject: email, email, emailVerified: true });
  return c.json({
    ...await buildAccountState(c.env.DB, c.get("userId"), c.get("sessionState")),
    ...(c.get("authTransport") === "native" ? { native_token: nextSession.id } : {}),
  });
});

/** Google on the web: a same-origin POST from Account, like Apple's. */
auth.post("/google/web/start", async (c) => {
  c.header("Cache-Control", "no-store");
  const origin = new URL(c.req.url).origin;
  if (c.req.header("origin") !== origin || c.get("authTransport") !== "cookie") {
    return c.json({ error: "Start Google sign-in from Account on this website." }, 403);
  }
  if (c.get("sessionState") === "authenticated") return c.redirect("/you/account", 303);
  const config = googleConfig(c.env);
  const sessionId = c.get("sessionId");
  if (!config || !sessionId || !allowedGoogleOrigin(origin)) return c.redirect("/you/account?google=unavailable", 303);
  const flow = await startGoogleFlow(c.env.DB, config, { client: "web", sessionId, origin });
  return c.redirect(flow.url, 303);
});

/** Google on the iPhone: the URL for the system's sign-in sheet, which
 * returns to pinkslip://auth/google with the flow's state. */
auth.post("/google/native/start", async (c) => {
  const config = googleConfig(c.env);
  const sessionId = c.get("sessionId");
  if (c.get("authTransport") !== "native" || !sessionId) return c.json({ error: "Native session required" }, 400);
  if (!config) return c.json({ error: "Google sign-in isn't available", code: "google_unavailable" }, 503);
  const origin = new URL(c.req.url).origin;
  const flow = await startGoogleFlow(c.env.DB, config, {
    client: "native", sessionId, origin: allowedGoogleOrigin(origin) ? origin : "https://pinkslip.work",
  });
  return c.json({ url: flow.url, state: flow.state, return_url: "pinkslip://auth/google" });
});

/**
 * Where Google sends the person back. A web flow signs in here, on the
 * session that started it; a native flow keeps the verified identity for the
 * app to collect (the sign-in sheet has no cookies) and returns to the app.
 */
auth.get("/google/callback", async (c) => {
  c.header("Cache-Control", "no-store");
  const url = new URL(c.req.url);
  const state = url.searchParams.get("state") ?? "";
  const flow = await loadGoogleFlow(c.env.DB, state);
  const native = flow?.client === "native";
  const done = (result: string) => native
    ? c.redirect(`pinkslip://auth/google?result=${result}${result === "success" ? `&state=${encodeURIComponent(state)}` : ""}`, 302)
    : c.redirect(`/you/account?google=${result}`, 303);
  const config = googleConfig(c.env);
  if (!flow || !config) return done("error");
  if (url.searchParams.get("error")) {
    await consumeGoogleFlow(c.env.DB, state);
    return done(url.searchParams.get("error") === "access_denied" ? "cancelled" : "error");
  }
  const code = url.searchParams.get("code");
  if (!code) return done("error");
  try {
    const identity = await exchangeGoogleCode(config, flow, code);
    if (native) {
      await c.env.DB.prepare("UPDATE oauth_flows SET result_json = ? WHERE id = ? AND consumed_at IS NULL")
        .bind(JSON.stringify(identity), state).run();
      return done("success");
    }
    const session = await loadActiveSession(c.env.DB, parseCookie(c.req.header("cookie"), COOKIE_NAMES.session) ?? "");
    if (!session || session.id !== flow.session_id || session.state !== "guest") throw new Error("Session changed during sign-in");
    if (!(await consumeGoogleFlow(c.env.DB, state))) throw new Error("Flow already used");
    c.set("userId", session.user_id);
    c.set("sessionId", session.id);
    c.set("sessionState", session.state);
    c.set("authTransport", "cookie");
    await signInWithIdentity(c, {
      provider: "google", providerSubject: identity.sub, email: identity.email, emailVerified: identity.emailVerified, fullName: identity.name,
    });
    return done("success");
  } catch (error) {
    // Never log Google's code or token.
    console.error("Google sign-in failed:", error instanceof Error ? error.message : "unknown");
    return done("error");
  }
});

/** The app collects the identity Google confirmed, on the session that started it. */
auth.post("/google/native/finish", async (c) => {
  const body = await c.req.json<{ state?: string }>().catch(() => null);
  const state = body?.state?.trim() ?? "";
  const flow = await loadGoogleFlow(c.env.DB, state);
  if (!flow || flow.client !== "native" || flow.session_id !== c.get("sessionId") || !flow.result_json) {
    return c.json({ error: "Google sign-in didn't finish. Try again.", code: "google_incomplete" }, 400);
  }
  if (!(await consumeGoogleFlow(c.env.DB, state))) return c.json({ error: "Google sign-in didn't finish. Try again.", code: "google_incomplete" }, 400);
  const identity = JSON.parse(flow.result_json) as GoogleIdentity;
  const nextSession = await signInWithIdentity(c, {
    provider: "google", providerSubject: identity.sub, email: identity.email, emailVerified: identity.emailVerified, fullName: identity.name,
  });
  return c.json({
    ...await buildAccountState(c.env.DB, c.get("userId"), c.get("sessionState")),
    native_token: nextSession.id,
  });
});

auth.post("/logout", async (c) => {
  await revokeApiTokensForUser(c.env.DB, c.get("userId"));
  const guestSession = await replaceSession(
    c.env.DB,
    c.get("sessionId"),
    crypto.randomUUID(),
    "guest"
  );

  c.header(
    "Set-Cookie",
    buildCookie(COOKIE_NAMES.session, guestSession.id, c.req.url),
    { append: true }
  );
  c.set("userId", guestSession.user_id);
  c.set("sessionId", guestSession.id);
  c.set("sessionState", "guest");

  return c.json({
    ...await buildAccountState(c.env.DB, guestSession.user_id, "guest"),
    ...(c.get("authTransport") === "native" ? { native_token: guestSession.id } : {}),
  });
});

auth.delete("/account", async (c) => {
  if (c.get("sessionState") !== "authenticated") {
    return c.json({ error: "No signed-in account to delete" }, 400);
  }

  const deletedUserId = c.get("userId");
  const appleIdentity = await c.env.DB.prepare(
    "SELECT id FROM auth_identities WHERE user_id = ? AND provider = 'apple' LIMIT 1"
  ).bind(deletedUserId).first<{ id: string }>();
  const appleRevocation = appleIdentity
    ? await revokeAppleAuthorizationForUser(c.env, deletedUserId)
    : "no_token";
  try {
    await deleteUserAccountData(c.env.DB, deletedUserId, c.env.RESUME_BUCKET);
  } catch (error) {
    if (error instanceof ArtifactStorageUnavailableError) {
      return c.json({ error: error.message, code: error.code }, 503);
    }
    throw error;
  }

  const guestSession = await createGuestSession(c.env.DB);
  c.header(
    "Set-Cookie",
    buildCookie(COOKIE_NAMES.session, guestSession.id, c.req.url),
    { append: true }
  );
  c.set("userId", guestSession.user_id);
  c.set("sessionId", guestSession.id);
  c.set("sessionState", "guest");

  return c.json({
    ...await buildAccountState(c.env.DB, guestSession.user_id, "guest"),
    apple_revoke_required: Boolean(appleIdentity) && appleRevocation !== "revoked",
    ...(c.get("authTransport") === "native" ? { native_token: guestSession.id } : {}),
  });
});

export async function completeEmailMagicLink(
  request: Request,
  env: Env,
  currentUserId: string,
  currentSessionId: string | null
) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token")?.trim();
  if (!token) {
    return new Response("Missing email login token", { status: 400 });
  }

  const consumed = await consumeEmailLoginToken(env.DB, token);
  if (!consumed) {
    return Response.redirect(new URL("/you/account?auth=email-expired", request.url).toString(), 302);
  }

  const identity = await findIdentityByProviderSubject(env.DB, "email", normalizeEmail(consumed.email))
    ?? await findIdentityByEmail(env.DB, normalizeEmail(consumed.email));
  const targetUserId = identity?.user_id ?? currentUserId;

  if (identity && currentUserId !== targetUserId) {
    await mergeGuestDataIntoAccount(env.DB, {
      sourceUserId: currentUserId,
      targetUserId,
      sourceLabel: `guest import ${new Date().toISOString()}`,
    });
  }

  if (!identity) {
    await env.DB.prepare(
      `INSERT INTO auth_identities (
         id, user_id, provider, provider_subject, email, email_verified, created_at, last_used_at
       ) VALUES (?, ?, 'email', ?, ?, 1, ?, ?)`
    ).bind(
      crypto.randomUUID(),
      targetUserId,
      normalizeEmail(consumed.email),
      consumed.email,
      new Date().toISOString(),
      new Date().toISOString()
    ).run();
  }

  await revokeApiTokensForUser(env.DB, targetUserId);
  const nextSession = await replaceSession(env.DB, currentSessionId, targetUserId, "authenticated");
  // NB: Response.redirect() returns immutable headers in Workers, so appending
  // Set-Cookie to it throws ("Can't modify immutable headers") → 500. Build the
  // redirect manually so the session cookie can ride along.
  const redirectUrl = new URL("/you/account?auth=email-success", request.url);
  return new Response(null, {
    status: 302,
    headers: {
      Location: redirectUrl.toString(),
      "Set-Cookie": buildCookie(COOKIE_NAMES.session, nextSession.id, request.url),
    },
  });
}

export default auth;
