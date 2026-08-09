import { describe, expect, test } from "bun:test";
import {
  loadTailorUsage,
  nextUtcDay,
  reserveAppTailorQuota,
} from "@worker/tailor/usage";

function usageDb(
  args: {
    appCount?: number;
    userCount?: number;
    providerUnits?: number;
    reservationChanges?: number;
  },
  preparedSql: string[] = [],
) {
  return {
    prepare(sql: string) {
      preparedSql.push(sql);
      const statement = {
        bind() {
          return statement;
        },
        async first<T>() {
          const count = sql.includes("user_id = ?")
            ? args.userCount ?? 0
            : args.appCount ?? 0;
          return { count, provider_units: args.providerUnits ?? 0 } as T;
        },
        async run() {
          return { meta: { changes: args.reservationChanges ?? 1 } };
        },
      };
      return statement;
    },
  } as unknown as D1Database;
}

describe("tailoring usage", () => {
  test("reports Workers AI app and per-user usage from one canonical ledger", async () => {
    const preparedSql: string[] = [];
    const usage = await loadTailorUsage({
      db: usageDb({ appCount: 10, userCount: 4, providerUnits: 274.5 }, preparedSql),
      userId: "user-1",
      model: "@cf/zai-org/glm-4.7-flash",
    });

    expect(usage.provider).toBe("workers_ai");
    expect(usage.app_today).toBe(10);
    expect(usage.included_user_today).toBe(4);
    expect(usage.included_user_remaining).toBe(11);
    expect(usage.provider_units_today).toBe(274.5);
    expect(usage.provider_units_limit).toBe(10_000);
    expect(usage.provider_units_remaining).toBe(9_725.5);
    expect(preparedSql.join("\n")).not.toContain("provider =");
    expect(preparedSql.join("\n")).not.toContain("key_source");
  });

  test("returns the next UTC boundary, including month rollover", () => {
    expect(nextUtcDay(new Date("2026-07-31T23:59:59.000Z"))).toBe("2026-08-01T00:00:00.000Z");
  });

  test("reports whether the atomic reservation was accepted", async () => {
    const accepted = await reserveAppTailorQuota(
      usageDb({ reservationChanges: 1 }),
      "user-1",
      "@cf/zai-org/glm-4.7-flash",
    );
    expect(accepted.ok).toBe(true);
    if (accepted.ok) expect(accepted.usageId).toBeString();

    const rejected = await reserveAppTailorQuota(
      usageDb({ reservationChanges: 0 }),
      "user-1",
      "@cf/zai-org/glm-4.7-flash",
    );
    expect(rejected.ok).toBe(false);
    if (!rejected.ok) expect(rejected.resets_at).toEndWith("T00:00:00.000Z");
  });
});
