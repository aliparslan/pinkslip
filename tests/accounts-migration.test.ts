import { Database } from "bun:sqlite";
import { afterEach, describe, expect, it } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";

const migrationsDir = new URL("../migrations/", import.meta.url).pathname;
const files = readdirSync(migrationsDir).filter((name) => name.endsWith(".sql")).sort();
const databases: Database[] = [];
afterEach(() => {
  for (const db of databases.splice(0)) db.close();
});

describe("migration 0098 rebuilds auth_identities", () => {
  it("keeps every identity and Apple refresh token, and allows Google and passwords", () => {
    const sqlite = new Database(":memory:");
    databases.push(sqlite);
    sqlite.exec("PRAGMA foreign_keys = ON");
    for (const file of files.filter((name) => name < "0098")) sqlite.exec(readFileSync(`${migrationsDir}${file}`, "utf8"));
    sqlite.run("INSERT INTO users (id) VALUES ('u1'), ('u2')");
    sqlite.run(`INSERT INTO auth_identities (id, user_id, provider, provider_subject, email, email_verified, created_at, last_used_at)
      VALUES ('i1', 'u1', 'apple', 'apple-sub', 'a@privaterelay.appleid.com', 1, '2026-01-01', '2026-02-01'),
             ('i2', 'u2', 'email', 'b@example.com', 'b@example.com', 1, '2026-01-02', NULL)`);
    sqlite.run(`INSERT INTO apple_refresh_tokens (identity_id, user_id, encrypted_token, created_at, updated_at)
      VALUES ('i1', 'u1', 'sealed', '2026-01-01', '2026-01-01')`);
    const before = sqlite.query("SELECT id, user_id, provider, provider_subject, email, email_verified, created_at, last_used_at FROM auth_identities ORDER BY id").all();

    sqlite.exec(readFileSync(`${migrationsDir}0098_accounts.sql`, "utf8"));

    expect(sqlite.query("SELECT id, user_id, provider, provider_subject, email, email_verified, created_at, last_used_at FROM auth_identities ORDER BY id").all()).toEqual(before);
    expect(sqlite.query("SELECT identity_id, encrypted_token FROM apple_refresh_tokens").all()).toEqual([{ identity_id: "i1", encrypted_token: "sealed" }]);
    expect(sqlite.query("PRAGMA foreign_key_check").all()).toEqual([]);
    sqlite.run(`INSERT INTO auth_identities (id, user_id, provider, provider_subject, email, email_verified, password_hash)
      VALUES ('i3', 'u1', 'google', 'google-sub', 'a@gmail.com', 1, NULL)`);
    // Deleting an identity still removes its Apple token, as before.
    sqlite.run("DELETE FROM auth_identities WHERE id = 'i1'");
    expect(sqlite.query("SELECT COUNT(*) AS count FROM apple_refresh_tokens").get()).toEqual({ count: 0 });
    expect(sqlite.query("SELECT name FROM sqlite_master WHERE name LIKE '%0098%'").all()).toEqual([]);
  });
});
