import { describe, it, expect } from "bun:test";
import { Hono } from "hono";
import {
  authMiddleware,
  generateApiToken,
  parseBearerToken,
  requireAdmin,
  requireAuthenticated,
} from "@worker/auth";
import preferenceRoutes from "@worker/routes/preferences";
import type { Env, Variables } from "@worker/types";
import { DEFAULT_SEARCH_PROFILE, normalizeSearchProfile } from "../shared/search-profile";

describe("parseBearerToken", () => {
  it("extracts the token from a Bearer header (case-insensitive)", () => {
    expect(parseBearerToken("Bearer abc.def")).toBe("abc.def");
    expect(parseBearerToken("bearer xyz")).toBe("xyz");
  });

  it("returns undefined for missing or non-bearer headers", () => {
    expect(parseBearerToken(undefined)).toBeUndefined();
    expect(parseBearerToken("Basic abc")).toBeUndefined();
    expect(parseBearerToken("Bearer ")).toBeUndefined();
  });
});

describe("generateApiToken", () => {
  it("produces a urlsafe ~43-char token that is unique per call", () => {
    const a = generateApiToken();
    const b = generateApiToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(a.length).toBeGreaterThanOrEqual(42);
    expect(a).not.toBe(b);
  });
});

function fakeDb(
  tokens: Record<string, string>,
  roles: Record<string, "user" | "admin"> = {},
  identityCounts?: Record<string, number>
): D1Database {
  const sessions = new Map<string, { user_id: string; state: "guest" | "authenticated"; expires_at: string }>();
  const users = new Set<string>(Object.values(tokens));
  const userRoles = new Map<string, "user" | "admin">(
    Object.values(tokens).map((userId) => [userId, roles[userId] ?? "user"])
  );
  // Real bearer users are authenticated and therefore have a sign-in identity, so
  // default every token's user to 1 identity unless a test overrides the count.
  const identityCount = new Map<string, number>(
    Object.values(tokens).map((userId) => [userId, identityCounts?.[userId] ?? 1])
  );

  return {
    prepare(sql: string) {
      const normalized = sql.replace(/\s+/g, " ").trim();
      let bindings: any[] = [];
      const stmt = {
        bind(...args: any[]) {
          bindings = args;
          return stmt;
        },
        async first<T>() {
          if (normalized.includes("SELECT user_id FROM api_tokens WHERE token = ?")) {
            const userId = tokens[bindings[0]];
            return (userId ? { user_id: userId } : null) as T | null;
          }
          if (normalized.includes("SELECT id FROM users WHERE id = ? LIMIT 1")) {
            return (users.has(bindings[0]) ? { id: bindings[0] } : null) as T | null;
          }
          if (normalized.includes("SELECT role FROM users WHERE id = ? LIMIT 1")) {
            const role = userRoles.get(bindings[0]);
            return (role ? { role } : null) as T | null;
          }
          if (normalized.includes("COUNT(*) AS count FROM auth_identities")) {
            return { count: identityCount.get(bindings[0]) ?? 0 } as T | null;
          }
          if (normalized.includes("SELECT id, user_id, state, created_at, expires_at, revoked_at, last_seen_at FROM auth_sessions")) {
            const session = sessions.get(bindings[0]);
            return (session
              ? {
                  id: bindings[0],
                  user_id: session.user_id,
                  state: session.state,
                  created_at: new Date().toISOString(),
                  expires_at: session.expires_at,
                  revoked_at: null,
                  last_seen_at: new Date().toISOString(),
                }
              : null) as T | null;
          }
          return null as T | null;
        },
        async run() {
          if (normalized.startsWith("INSERT INTO users")) {
            users.add(bindings[0]);
            if (!userRoles.has(bindings[0])) userRoles.set(bindings[0], "user");
          } else if (normalized.startsWith("INSERT INTO auth_sessions")) {
            sessions.set(bindings[0], {
              user_id: bindings[1],
              state: bindings[2],
              expires_at: bindings[4],
            });
          }
          return {} as any;
        },
      };
      return stmt as any;
    },
  } as unknown as D1Database;
}

function appWith() {
  const app = new Hono<{ Bindings: Env; Variables: Variables }>();
  app.use("/api/*", authMiddleware);
  app.get("/api/me", (c) => c.json({
    userId: c.get("userId"),
    sessionState: c.get("sessionState"),
  }));
  app.get("/api/bootstrap", (c) => c.json({
    userId: c.get("userId"),
    sessionState: c.get("sessionState"),
  }));
  app.post("/api/whoami", (c) => c.json({
    userId: c.get("userId"),
    sessionState: c.get("sessionState"),
  }));
  app.route("/api/preferences", preferenceRoutes);
  app.get("/api/signed-in", requireAuthenticated, (c) => c.json({ ok: true }));
  app.post("/api/admin", requireAdmin, (c) => c.json({ ok: true }));
  return app;
}

const ENV = (db: D1Database) => ({ DB: db }) as unknown as Env;

describe("authMiddleware", () => {
  it("authenticates a valid bearer token and sets userId", async () => {
    const db = fakeDb({ "good-token": "user-42" });
    const app = appWith();
    const res = await (app.fetch as any)(
      new Request("http://localhost/api/me", {
        headers: { authorization: "Bearer good-token" },
      }),
      ENV(db)
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ userId: "user-42", sessionState: "authenticated" });
  });

  it("rejects a bearer token whose user has no sign-in identity (guest-minted)", async () => {
    // Regression: a guest could mint a token via /api/auth/token and then be
    // treated as fully authenticated. A token only counts as authenticated when
    // its user has an actual sign-in identity.
    const db = fakeDb({ "guest-token": "guest-9" }, {}, { "guest-9": 0 });
    const app = appWith();
    const res = await (app.fetch as any)(
      new Request("http://localhost/api/me", {
        headers: { authorization: "Bearer guest-token" },
      }),
      ENV(db)
    );
    expect(res.status).toBe(401);
    expect(((await res.json()) as { code: string }).code).toBe("invalid_token");
  });

  it("rejects an invalid bearer token with 401", async () => {
    const db = fakeDb({ "good-token": "user-42" });
    const app = appWith();
    const res = await (app.fetch as any)(
      new Request("http://localhost/api/me", {
        headers: { authorization: "Bearer nope" },
      }),
      ENV(db)
    );
    expect(res.status).toBe(401);
    expect(((await res.json()) as { code: string }).code).toBe("invalid_token");
  });

  it("keeps passive reads anonymous without creating a session", async () => {
    const db = fakeDb({});
    const app = appWith();
    const res = await (app.fetch as any)(
      new Request("http://localhost/api/me"),
      ENV(db)
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ userId: "", sessionState: "anonymous" });
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("allows the combined bootstrap read without creating a session", async () => {
    const db = fakeDb({});
    const app = appWith();
    const res = await (app.fetch as any)(
      new Request("http://localhost/api/bootstrap"),
      ENV(db)
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ userId: "", sessionState: "anonymous" });
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("returns default preferences anonymously without creating a session", async () => {
    const db = fakeDb({});
    const app = appWith();
    const res = await (app.fetch as any)(
      new Request("http://localhost/api/preferences"),
      ENV(db)
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      search_profile: normalizeSearchProfile(DEFAULT_SEARCH_PROFILE),
      notify_threshold: DEFAULT_SEARCH_PROFILE.match_threshold,
    });
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("creates a guest session on the first state-changing action", async () => {
    const db = fakeDb({});
    const app = appWith();
    const res = await (app.fetch as any)(
      new Request("http://localhost/api/whoami", { method: "POST" }),
      ENV(db)
    );
    expect(res.status).toBe(200);
    expect((await res.json()) as { sessionState: string }).toMatchObject({ sessionState: "guest" });
    expect(res.headers.get("set-cookie")).toContain("psid=");
  });

  it("rejects guests from authenticated-only routes", async () => {
    const db = fakeDb({});
    const app = appWith();
    const guest = await (app.fetch as any)(
      new Request("http://localhost/api/whoami", { method: "POST" }),
      ENV(db)
    );
    const cookie = guest.headers.get("set-cookie")?.split(";")[0] ?? "";
    const res = await (app.fetch as any)(
      new Request("http://localhost/api/signed-in", { headers: { cookie } }),
      ENV(db)
    );
    expect(res.status).toBe(401);
    expect(((await res.json()) as { code: string }).code).toBe("authentication_required");
  });

  it("rejects an authenticated non-admin from admin routes", async () => {
    const db = fakeDb({ "good-token": "user-42" });
    const app = appWith();
    const res = await (app.fetch as any)(
      new Request("http://localhost/api/admin", {
        method: "POST",
        headers: { authorization: "Bearer good-token" },
      }),
      ENV(db)
    );
    expect(res.status).toBe(403);
    expect(((await res.json()) as { code: string }).code).toBe("admin_required");
  });

  it("allows an authenticated admin through admin routes", async () => {
    const db = fakeDb(
      { "admin-token": "admin-1" },
      { "admin-1": "admin" }
    );
    const app = appWith();
    const res = await (app.fetch as any)(
      new Request("http://localhost/api/admin", {
        method: "POST",
        headers: { authorization: "Bearer admin-token" },
      }),
      ENV(db)
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});
