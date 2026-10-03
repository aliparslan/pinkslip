import { afterEach, describe, expect, it } from "bun:test";
import { Database } from "bun:sqlite";
import { mergePushSubscriptions } from "@worker/account";

type Binding = string | number | null;
interface BoundStatement {
  sql: string;
  bindings: Binding[];
}

const databases: Database[] = [];
afterEach(() => {
  for (const db of databases.splice(0)) db.close();
});

async function subscriptionDb() {
  const sqlite = new Database(":memory:");
  databases.push(sqlite);
  sqlite.exec(`
    CREATE TABLE push_subscriptions (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      endpoint TEXT NOT NULL UNIQUE,
      p256dh TEXT NOT NULL DEFAULT '',
      auth TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      platform TEXT NOT NULL DEFAULT 'web'
    );
  `);
  sqlite.exec(await Bun.file(new URL("../migrations/0070_push_installation_id.sql", import.meta.url)).text());

  const db = {
    prepare(sql: string) {
      const statement = {
        sql,
        bindings: [] as Binding[],
        bind(...bindings: Binding[]) {
          statement.bindings = bindings;
          return statement;
        },
      };
      return statement;
    },
    async batch(statements: BoundStatement[]) {
      return sqlite.transaction(() => statements.map(({ sql, bindings }) => {
        const result = sqlite.query(sql).run(...bindings);
        return { success: true, results: [], meta: { changes: result.changes } };
      }))();
    },
  } as unknown as D1Database;

  function add(id: string, userId: string, installation: string | null, createdAt: string, platform = "ios") {
    sqlite.query(`
      INSERT INTO push_subscriptions (id, user_id, endpoint, installation_id, created_at, platform)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, userId, `endpoint-${id}`, installation, createdAt, platform);
  }

  function registrations() {
    return sqlite.query("SELECT id, user_id, installation_id, platform FROM push_subscriptions ORDER BY id").all();
  }

  return { db, sqlite, add, registrations };
}

describe("push subscriptions during account merge", () => {
  it("keeps the newer guest token when the account already has the same installation", async () => {
    const { db, add, registrations } = await subscriptionDb();
    add("old-account", "account", "phone", "2026-09-18T22:03:23.414Z");
    add("current-guest", "guest", "phone", "2026-09-27T23:46:22.897Z");

    await mergePushSubscriptions(db, "guest", "account");

    expect(registrations()).toEqual([
      { id: "current-guest", user_id: "account", installation_id: "phone", platform: "ios" },
    ]);
  });

  it("keeps a newer account token instead of restoring an older guest token", async () => {
    const { db, add, registrations } = await subscriptionDb();
    add("old-guest", "guest", "phone", "2026-09-18 22:03:23");
    add("current-account", "account", "phone", "2026-09-27T23:46:22.897Z");

    await mergePushSubscriptions(db, "guest", "account");

    expect(registrations()).toEqual([
      { id: "current-account", user_id: "account", installation_id: "phone", platform: "ios" },
    ]);
  });

  it("keeps the guest registration when timestamps tie", async () => {
    const { db, add, registrations } = await subscriptionDb();
    add("account-token", "account", "phone", "2026-09-27 23:46:22");
    add("guest-token", "guest", "phone", "2026-09-27T23:46:22.000Z");

    await mergePushSubscriptions(db, "guest", "account");

    expect(registrations()).toEqual([
      { id: "guest-token", user_id: "account", installation_id: "phone", platform: "ios" },
    ]);
  });

  it("compares registrations within the same second without discarding the newer token", async () => {
    const { db, add, registrations } = await subscriptionDb();
    add("older-guest", "guest", "phone", "2026-09-27T23:46:22.100Z");
    add("newer-account", "account", "phone", "2026-09-27T23:46:22.900Z");

    await mergePushSubscriptions(db, "guest", "account");

    expect(registrations()).toEqual([
      { id: "newer-account", user_id: "account", installation_id: "phone", platform: "ios" },
    ]);
  });

  it("preserves other devices, other accounts, web subscriptions and legacy iOS tokens", async () => {
    const { db, add, registrations } = await subscriptionDb();
    const date = "2026-09-27T23:46:22.897Z";
    add("guest-phone", "guest", "phone", date);
    add("account-tablet", "account", "tablet", date);
    add("other-account", "other", "phone", date);
    add("guest-web", "guest", "phone", date, "web");
    add("account-web", "account", "phone", date, "web");
    add("guest-legacy", "guest", null, date);
    add("account-legacy", "account", null, date);

    await mergePushSubscriptions(db, "guest", "account");

    expect(registrations()).toEqual([
      { id: "account-legacy", user_id: "account", installation_id: null, platform: "ios" },
      { id: "account-tablet", user_id: "account", installation_id: "tablet", platform: "ios" },
      { id: "account-web", user_id: "account", installation_id: "phone", platform: "web" },
      { id: "guest-legacy", user_id: "account", installation_id: null, platform: "ios" },
      { id: "guest-phone", user_id: "account", installation_id: "phone", platform: "ios" },
      { id: "guest-web", user_id: "account", installation_id: "phone", platform: "web" },
      { id: "other-account", user_id: "other", installation_id: "phone", platform: "ios" },
    ]);
  });

  it("leaves registrations intact when source and target are the same account", async () => {
    const { db, add, registrations } = await subscriptionDb();
    add("current", "account", "phone", "2026-09-27T23:46:22.897Z");

    await mergePushSubscriptions(db, "account", "account");

    expect(registrations()).toEqual([
      { id: "current", user_id: "account", installation_id: "phone", platform: "ios" },
    ]);
  });

  it("rolls back pruning if transferring registration ownership fails", async () => {
    const { db, sqlite, add, registrations } = await subscriptionDb();
    add("old-account", "account", "phone", "2026-09-18T22:03:23.414Z");
    add("current-guest", "guest", "phone", "2026-09-27T23:46:22.897Z");
    sqlite.exec(`
      CREATE TRIGGER fail_transfer BEFORE UPDATE OF user_id ON push_subscriptions
      BEGIN SELECT RAISE(ABORT, 'transfer failed'); END;
    `);

    await expect(mergePushSubscriptions(db, "guest", "account")).rejects.toThrow("transfer failed");

    expect(registrations()).toEqual([
      { id: "current-guest", user_id: "guest", installation_id: "phone", platform: "ios" },
      { id: "old-account", user_id: "account", installation_id: "phone", platform: "ios" },
    ]);
  });
});
