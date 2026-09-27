import { describe, it, expect } from "bun:test";
import { Hono } from "hono";
import { authMiddleware } from "@worker/auth";
import pushRoutes from "@worker/routes/push";
import type { Env, PushSubscriptionRow, Variables } from "@worker/types";

function fakeDb() {
  const rows = new Map<string, PushSubscriptionRow>();

  return Object.assign({
    prepare(sql: string) {
      let binds: unknown[] = [];
      const stmt = {
        bind(...args: unknown[]) {
          binds = args;
          return stmt;
        },
        async run() {
          if (sql.includes("INSERT INTO users")) return { success: true };
          if (sql.includes("DELETE FROM push_subscriptions")) {
            const [userId, installationId, endpoint] = binds as string[];
            for (const [key, row] of rows) {
              if (
                row.user_id === userId
                && row.platform === "ios"
                && row.installation_id === installationId
                && row.endpoint !== endpoint
              ) rows.delete(key);
            }
          }
          if (sql.includes("INSERT INTO push_subscriptions")) {
            const [id, userId, endpoint, createdAt, installationId] = binds as string[];
            const existing = [...rows.values()].find((r) => r.endpoint === endpoint);
            const row: PushSubscriptionRow = {
              id: existing?.id ?? id,
              user_id: userId,
              endpoint,
              p256dh: "",
              auth: "",
              created_at: createdAt,
              platform: "ios",
              installation_id: installationId ?? null,
            };
            rows.set(endpoint, row);
          }
          return { success: true };
        },
        async first<T>() {
          if (sql.includes("SELECT user_id, last_used_at FROM api_tokens WHERE token")) {
            const token = binds[0] as string;
            return (token === "good-token"
              ? { user_id: "user-abc", last_used_at: null }
              : null) as T | null;
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
    async batch(statements: Array<{ run(): Promise<unknown> }>) {
      return Promise.all(statements.map((statement) => statement.run()));
    },
  }, { debugRows: rows }) as unknown as D1Database & {
    debugRows: Map<string, PushSubscriptionRow>;
  };
}

function appWith() {
  const app = new Hono<{ Bindings: Env; Variables: Variables }>();
  app.use("/api/v2/*", authMiddleware);
  app.route("/api/v2/push", pushRoutes);
  return app;
}

function envWith(db: D1Database): Env {
  return {
    DB: db,
    VAPID_PUBLIC_KEY: "test-public-key",
    VAPID_PRIVATE_KEY: "test-private-key",
    VAPID_SUBJECT: "mailto:test@example.com",
  };
}

describe("POST /api/v2/push/apns", () => {
  it("stores an iOS device token for the authenticated user", async () => {
    const deviceToken = "ab".repeat(32);
    const installationId = "123e4567-e89b-42d3-a456-426614174000";
    const db = fakeDb();
    const app = appWith();
    const res = await (app.fetch as any)(
      new Request("https://pinkslip.alip.dev/api/v2/push/apns", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: "Bearer good-token",
        },
        body: JSON.stringify({ token: deviceToken, installation_id: installationId }),
      }),
      envWith(db)
    );

    expect(res.status).toBe(201);
    const body = (await res.json()) as PushSubscriptionRow;
    expect(body.endpoint).toBe(deviceToken);
    expect(body.platform).toBe("ios");
    expect(body.user_id).toBe("user-abc");
    expect(body.installation_id).toBe(installationId);
  });

  it("rejects a missing token", async () => {
    const db = fakeDb();
    const app = appWith();
    const res = await (app.fetch as any)(
      new Request("https://pinkslip.alip.dev/api/v2/push/apns", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: "Bearer good-token",
        },
        body: JSON.stringify({ token: "  " }),
      }),
      envWith(db)
    );

    expect(res.status).toBe(400);
  });

  it("replaces a rotated token for the same app installation", async () => {
    const db = fakeDb();
    const app = appWith();
    const installationId = "123e4567-e89b-42d3-a456-426614174000";

    for (const token of ["ab".repeat(32), "cd".repeat(32)]) {
      const res = await (app.fetch as any)(
        new Request("https://pinkslip.alip.dev/api/v2/push/apns", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: "Bearer good-token",
          },
          body: JSON.stringify({ token, installation_id: installationId }),
        }),
        envWith(db)
      );
      expect(res.status).toBe(201);
    }

    expect(db.debugRows.size).toBe(1);
    expect([...db.debugRows.values()][0]?.endpoint).toBe("cd".repeat(32));
  });

  it("rejects a malformed installation identifier", async () => {
    const app = appWith();
    const res = await (app.fetch as any)(
      new Request("https://pinkslip.alip.dev/api/v2/push/apns", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: "Bearer good-token",
        },
        body: JSON.stringify({
          token: "ab".repeat(32),
          installation_id: "same-phone",
        }),
      }),
      envWith(fakeDb())
    );
    expect(res.status).toBe(400);
  });
});
