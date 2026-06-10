import { describe, it, expect } from "bun:test";
import { Hono } from "hono";
import { authMiddleware } from "@worker/auth";
import pushRoutes from "@worker/routes/push";
import type { Env, PushSubscriptionRow, Variables } from "@worker/types";

function fakeDb() {
  const rows = new Map<string, PushSubscriptionRow>();

  return {
    prepare(sql: string) {
      let binds: unknown[] = [];
      const stmt = {
        bind(...args: unknown[]) {
          binds = args;
          return stmt;
        },
        async run() {
          if (sql.includes("INSERT INTO users")) return { success: true };
          if (sql.includes("INSERT INTO push_subscriptions")) {
            const [id, userId, endpoint, p256dh, auth, createdAt, platform] = binds as string[];
            const existing = [...rows.values()].find((r) => r.endpoint === endpoint);
            const row: PushSubscriptionRow = {
              id: existing?.id ?? id,
              user_id: userId,
              endpoint,
              p256dh,
              auth,
              created_at: createdAt,
              platform: platform ?? "ios",
            };
            rows.set(endpoint, row);
          }
          return { success: true };
        },
        async first<T>() {
          if (sql.includes("SELECT user_id FROM api_tokens WHERE token")) {
            const token = binds[0] as string;
            return (token === "good-token" ? { user_id: "user-abc" } : null) as T | null;
          }
          if (sql.includes("COUNT(*) AS count FROM auth_identities")) {
            // The bearer user is a real authenticated account, so it has an identity.
            return { count: 1 } as T | null;
          }
          if (sql.includes("FROM push_subscriptions WHERE endpoint")) {
            const endpoint = binds[0] as string;
            return (rows.get(endpoint) ?? null) as T | null;
          }
          return null;
        },
      };
      return stmt as any;
    },
  } as unknown as D1Database;
}

function appWith(db: D1Database) {
  const app = new Hono<{ Bindings: Env; Variables: Variables }>();
  app.use("/api/*", authMiddleware);
  app.route("/api/push", pushRoutes);
  return app;
}

describe("POST /api/push/apns", () => {
  it("stores an iOS device token for the authenticated user", async () => {
    const deviceToken = "ab".repeat(32);
    const db = fakeDb();
    const app = appWith(db);
    const res = await (app.fetch as any)(
      new Request("https://pinkslip.alip.dev/api/push/apns", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: "Bearer good-token",
        },
        body: JSON.stringify({ token: deviceToken }),
      }),
      { DB: db } as Env
    );

    expect(res.status).toBe(201);
    const body = (await res.json()) as PushSubscriptionRow;
    expect(body.endpoint).toBe(deviceToken);
    expect(body.platform).toBe("ios");
    expect(body.user_id).toBe("user-abc");
  });

  it("rejects a missing token", async () => {
    const db = fakeDb();
    const app = appWith(db);
    const res = await (app.fetch as any)(
      new Request("https://pinkslip.alip.dev/api/push/apns", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: "Bearer good-token",
        },
        body: JSON.stringify({ token: "  " }),
      }),
      { DB: db } as Env
    );

    expect(res.status).toBe(400);
  });
});
