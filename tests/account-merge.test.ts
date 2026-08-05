import { describe, expect, it } from "bun:test";
import {
  mergedAccountRole,
  preserveMergedAccountRole,
} from "@worker/account";

function roleDb(initial: Record<string, "user" | "admin">): {
  db: D1Database;
  roles: Map<string, "user" | "admin">;
} {
  const roles = new Map(Object.entries(initial));

  const db = {
    prepare(sql: string) {
      const normalized = sql.replace(/\s+/g, " ").trim();
      let bindings: unknown[] = [];
      const statement = {
        bind(...values: unknown[]) {
          bindings = values;
          return statement;
        },
        async first<T>() {
          if (normalized === "SELECT role FROM users WHERE id = ? LIMIT 1") {
            const role = roles.get(String(bindings[0]));
            return (role ? { role } : null) as T | null;
          }
          return null as T | null;
        },
        async run() {
          if (normalized === "UPDATE users SET role = ? WHERE id = ?") {
            roles.set(
              String(bindings[1]),
              bindings[0] as "user" | "admin"
            );
          }
          return {};
        },
      };
      return statement;
    },
  } as unknown as D1Database;

  return { db, roles };
}

describe("account merge roles", () => {
  it("keeps the strongest role on the surviving account", () => {
    expect(mergedAccountRole("admin", "user")).toBe("admin");
    expect(mergedAccountRole("user", "admin")).toBe("admin");
    expect(mergedAccountRole("user", "user")).toBe("user");
  });

  it("promotes the verified target before the admin source is deleted", async () => {
    const { db, roles } = roleDb({ guest: "admin", account: "user" });

    await preserveMergedAccountRole(db, "guest", "account");

    expect(roles.get("account")).toBe("admin");
  });

  it("never demotes an existing admin target", async () => {
    const { db, roles } = roleDb({ guest: "user", account: "admin" });

    await preserveMergedAccountRole(db, "guest", "account");

    expect(roles.get("account")).toBe("admin");
  });
});
