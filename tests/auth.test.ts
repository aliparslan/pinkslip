import { describe, it, expect } from "bun:test";
import { Hono } from "hono";
import {
  authMiddleware,
  generateApiToken,
  parseBearerToken,
  requireAdmin,
  requireAuthenticated,
} from "@worker/auth";
import type { Env, Variables } from "@worker/types";

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
  roles: Record<string, "user" | "admin"> = {}
): D1Database {
  const sessions = new Map<string, { user_id: string; state: "guest" | "authenticated"; expires_at: string }>();
  const users = new Set<string>(Object.values(tokens));
  const userRoles = new Map<string, "user" | "admin">(
    Object.values(tokens).map((userId) => [userId, roles[userId] ?? "user"])
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

function appWith(db: D1Database) {
  const app = new Hono<{ Bindings: Env; Variables: Variables }>();
  app.use("/api/*", authMiddleware);
  app.get("/api/whoami", (c) => c.json({
    userId: c.get("userId"),
    sessionState: c.get("sessionState"),
  }));
  app.get("/api/signed-in", requireAuthenticated, (c) => c.json({ ok: true }));
  app.post("/api/admin", requireAdmin, (c) => c.json({ ok: true }));
  return app;
}

const ENV = (db: D1Database) => ({ DB: db }) as unknown as Env;

describe("authMiddleware", () => {
  it("authenticates a valid bearer token and sets userId", async () => {
    const db = fakeDb({ "good-token": "user-42" });
    const app = appWith(db);
    const res = await (app.fetch as any)(
      new Request("http://localhost/api/whoami", {
        headers: { authorization: "Bearer good-token" },
      }),
      ENV(db)
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ userId: "user-42", sessionState: "authenticated" });
  });

  it("rejects an invalid bearer token with 401", async () => {
    const db = fakeDb({ "good-token": "user-42" });
    const app = appWith(db);
    const res = await (app.fetch as any)(
      new Request("http://localhost/api/whoami", {
        headers: { authorization: "Bearer nope" },
      }),
      ENV(db)
    );
    expect(res.status).toBe(401);
    expect(((await res.json()) as { code: string }).code).toBe("invalid_token");
  });

  it("creates a guest session when no session cookie exists", async () => {
    const db = fakeDb({});
    const app = appWith(db);
    const res = await (app.fetch as any)(
      new Request("http://localhost/api/whoami"),
      ENV(db)
    );
    expect(res.status).toBe(200);
    expect((await res.json()) as { sessionState: string }).toMatchObject({ sessionState: "guest" });
    expect(res.headers.get("set-cookie")).toContain("psid=");
  });

  it("rejects guests from authenticated-only routes", async () => {
    const db = fakeDb({});
    const app = appWith(db);
    const res = await (app.fetch as any)(
      new Request("http://localhost/api/signed-in"),
      ENV(db)
    );
    expect(res.status).toBe(401);
    expect(((await res.json()) as { code: string }).code).toBe("authentication_required");
  });

  it("rejects an authenticated non-admin from admin routes", async () => {
    const db = fakeDb({ "good-token": "user-42" });
    const app = appWith(db);
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
    const app = appWith(db);
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
