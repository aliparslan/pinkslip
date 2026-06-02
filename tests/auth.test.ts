import { describe, it, expect } from "bun:test";
import { Hono } from "hono";
import {
  authMiddleware,
  generateApiToken,
  parseBearerToken,
} from "@worker/auth";
import type { Env, Variables } from "@worker/types";

// ─── Pure helpers ─────────────────────────────────────────────────────────────

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

// ─── Bearer auth middleware path ──────────────────────────────────────────────

// Minimal D1 stub: only the api_tokens lookup the middleware performs.
function fakeDb(tokens: Record<string, string>): D1Database {
  return {
    prepare(_sql: string) {
      let bound: string;
      const stmt = {
        bind(token: string) {
          bound = token;
          return stmt;
        },
        async first<T>() {
          const userId = tokens[bound];
          return (userId ? { user_id: userId } : null) as T | null;
        },
        async run() {
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
  app.get("/api/whoami", (c) => c.json({ userId: c.get("userId") }));
  return app;
}

const ENV = (db: D1Database) => ({ DB: db }) as unknown as Env;

describe("authMiddleware bearer path", () => {
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
    expect(await res.json()).toEqual({ userId: "user-42" });
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
});
