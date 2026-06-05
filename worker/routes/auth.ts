import { Hono } from "hono";
import {
  deleteUserAccountData,
  mergeGuestDataIntoAccount,
  normalizeEmail,
} from "../account";
import { verifyAppleIdentityToken } from "../apple";
import {
  buildCookie,
  COOKIE_NAMES,
  countIdentitiesForUser,
  createGuestSession,
  generateApiToken,
  getPrimaryIdentity,
  replaceSession,
  revokeApiTokensForUser,
} from "../auth";
import { randomOpaqueToken, sha256Hex } from "../crypto";
import { sendMagicLinkEmail } from "../email";
import type { AuthIdentityRow, Env, UserRow, Variables } from "../types";

const auth = new Hono<{ Bindings: Env; Variables: Variables }>();

async function loadUser(db: D1Database, userId: string) {
  return db.prepare(
    "SELECT id, name, created_at FROM users WHERE id = ?"
  ).bind(userId).first<UserRow>();
}

async function findIdentityByProviderSubject(
  db: D1Database,
  provider: "apple" | "email",
  providerSubject: string
) {
  return db.prepare(
    `SELECT id, user_id, provider, provider_subject, email, email_verified, created_at, last_used_at
     FROM auth_identities
     WHERE provider = ? AND provider_subject = ?
     LIMIT 1`
  ).bind(provider, providerSubject).first<AuthIdentityRow>();
}

async function findIdentityByEmail(db: D1Database, email: string) {
  return db.prepare(
    `SELECT id, user_id, provider, provider_subject, email, email_verified, created_at, last_used_at
     FROM auth_identities
     WHERE lower(email) = lower(?)
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
  sessionState: "guest" | "authenticated"
) {
  const user = await loadUser(db, userId);
  if (!user) {
    return {
      user: null,
      session: { state: sessionState },
      account: sessionState === "authenticated"
        ? { authenticated: true, email: null, providers: [] as string[] }
        : null,
    };
  }

  if (sessionState !== "authenticated") {
    return {
      user,
      session: { state: sessionState },
      account: null,
    };
  }

  const [primaryIdentity, identityCount] = await Promise.all([
    getPrimaryIdentity(db, userId),
    countIdentitiesForUser(db, userId),
  ]);

  return {
    user,
    session: { state: sessionState },
    account: {
      authenticated: true,
      email: primaryIdentity?.email ?? null,
      provider: primaryIdentity?.provider ?? null,
      providers: primaryIdentity ? [primaryIdentity.provider] : [],
      identity_count: identityCount,
    },
  };
}

async function signInWithIdentity(
  c: {
    env: Env;
    req: { url: string };
    get(key: "userId" | "sessionId" | "sessionState"): string | null;
    set(key: "userId" | "sessionId" | "sessionState", value: string): void;
    header(name: string, value: string, options?: { append?: boolean }): void;
  },
  args: {
    provider: "apple" | "email";
    providerSubject: string;
    email?: string | null;
    emailVerified?: boolean;
    fullName?: string | null;
  }
) {
  const now = new Date().toISOString();
  const db = c.env.DB as D1Database;
  const currentUserId = c.get("userId") as string;
  const currentSessionId = c.get("sessionId") as string | null;
  const normalizedEmail = args.email ? normalizeEmail(args.email) : null;

  const directIdentity = await findIdentityByProviderSubject(db, args.provider, args.providerSubject);
  const linkedIdentity = !directIdentity && normalizedEmail
    ? await findIdentityByEmail(db, normalizedEmail)
    : null;

  const targetUserId = directIdentity?.user_id ?? linkedIdentity?.user_id ?? currentUserId;

  if ((directIdentity || linkedIdentity) && currentUserId !== targetUserId) {
    await mergeGuestDataIntoAccount(db, {
      sourceUserId: currentUserId,
      targetUserId,
      sourceLabel: `guest import ${now}`,
    });
  }

  if (!directIdentity) {
    await db.prepare(
      `INSERT INTO auth_identities (
         id, user_id, provider, provider_subject, email, email_verified, created_at, last_used_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      crypto.randomUUID(),
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
  return nextSession;
}

async function consumeEmailLoginToken(db: D1Database, rawToken: string) {
  const tokenHash = await sha256Hex(rawToken);
  const now = new Date().toISOString();
  const row = await db.prepare(
    `SELECT id, email
     FROM email_login_tokens
     WHERE token_hash = ?
       AND consumed_at IS NULL
       AND datetime(expires_at) > datetime(?)
     LIMIT 1`
  ).bind(tokenHash, now).first<{ id: string; email: string }>();

  if (!row) {
    return null;
  }

  await db.prepare(
    "UPDATE email_login_tokens SET consumed_at = ? WHERE id = ?"
  ).bind(now, row.id).run();

  return row;
}

auth.post("/token", async (c) => {
  const userId = c.get("userId");

  const existing = await c.env.DB.prepare(
    "SELECT token FROM api_tokens WHERE user_id = ? LIMIT 1"
  ).bind(userId).first<{ token: string }>();

  if (existing?.token) {
    return c.json({ token: existing.token });
  }

  const token = generateApiToken();
  await c.env.DB.prepare(
    "INSERT INTO api_tokens (token, user_id, created_at) VALUES (?, ?, ?)"
  ).bind(token, userId, new Date().toISOString()).run();

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

  const verified = await verifyAppleIdentityToken(c.env, identityToken, body?.nonce?.trim() || undefined)
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

  await signInWithIdentity(c, {
    provider: "apple",
    providerSubject: verified.sub,
    email: body?.email?.trim() || verified.email || null,
    emailVerified: verified.email_verified === true || verified.email_verified === "true",
    fullName: body?.fullName?.trim() || null,
  });

  return c.json(await buildAccountState(c.env.DB, c.get("userId"), c.get("sessionState")));
});

auth.post("/email/start", async (c) => {
  const body = await c.req.json<{ email?: string; redirect_uri?: string }>().catch(() => null);
  const email = normalizeEmail(body?.email ?? "");
  if (!email || !email.includes("@")) {
    return c.json({ error: "Enter a valid email address" }, 400);
  }

  const rawToken = randomOpaqueToken(32);
  const tokenHash = await sha256Hex(rawToken);
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

  await c.env.DB.prepare(
    `INSERT INTO email_login_tokens (id, email, token_hash, expires_at, redirect_uri, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(
    crypto.randomUUID(),
    email,
    tokenHash,
    expiresAt,
    body?.redirect_uri?.trim() || null,
    new Date().toISOString()
  ).run();

  const verifyUrl = new URL("/auth/email/verify", c.req.url);
  verifyUrl.searchParams.set("token", rawToken);

  await sendMagicLinkEmail(c.env, {
    to: email,
    verifyUrl: verifyUrl.toString(),
  }).catch((error) => {
    throw error;
  });

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

  await signInWithIdentity(c, {
    provider: "email",
    providerSubject: normalizeEmail(consumed.email),
    email: consumed.email,
    emailVerified: true,
  });

  return c.json(await buildAccountState(c.env.DB, c.get("userId"), c.get("sessionState")));
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

  return c.json(await buildAccountState(c.env.DB, guestSession.user_id, "guest"));
});

auth.delete("/account", async (c) => {
  if (c.get("sessionState") !== "authenticated") {
    return c.json({ error: "No signed-in account to delete" }, 400);
  }

  const deletedUserId = c.get("userId");
  await deleteUserAccountData(c.env.DB, deletedUserId, c.env.RESUME_BUCKET);

  const guestSession = await createGuestSession(c.env.DB);
  c.header(
    "Set-Cookie",
    buildCookie(COOKIE_NAMES.session, guestSession.id, c.req.url),
    { append: true }
  );
  c.set("userId", guestSession.user_id);
  c.set("sessionId", guestSession.id);
  c.set("sessionState", "guest");

  return c.json(await buildAccountState(c.env.DB, guestSession.user_id, "guest"));
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
    return Response.redirect(new URL("/?auth=email-expired#/settings", request.url).toString(), 302);
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
  const redirectUrl = new URL("/?auth=email-success#/settings", request.url);
  return new Response(null, {
    status: 302,
    headers: {
      Location: redirectUrl.toString(),
      "Set-Cookie": buildCookie(COOKIE_NAMES.session, nextSession.id, request.url),
    },
  });
}

export default auth;
