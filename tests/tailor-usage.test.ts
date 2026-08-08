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
    includedUserCount?: number;
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
            ? sql.includes("key_source = 'app'")
              ? args.includedUserCount ?? 0
              : args.userCount ?? 0
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
  test("reports app and per-user daily limits independently", async () => {
    const preparedSql: string[] = [];
    const usage = await loadTailorUsage({
      db: usageDb({ appCount: 10, userCount: 9, includedUserCount: 4 }, preparedSql),
      userId: "user-1",
      provider: "gemini",
      model: "gemini-3.1-flash-lite",
    });

    expect(usage.app_remaining).toBe(490);
    expect(usage.user_today).toBe(9);
    expect(usage.included_user_today).toBe(4);
    expect(usage.user_remaining).toBe(6);
    expect(usage.included_user_remaining).toBe(11);
    expect(usage.daily_limit).toBe(500);
    const includedSql = preparedSql.find((sql) => sql.includes("user_id = ?") && sql.includes("key_source = 'app'"));
    expect(includedSql).toBeDefined();
    expect(includedSql).not.toContain("provider = ?");
    expect(includedSql).not.toContain("model = ?");
  });

  test("returns the next UTC boundary, including month rollover", () => {
    expect(nextUtcDay(new Date("2026-07-31T23:59:59.000Z"))).toBe("2026-08-01T00:00:00.000Z");
  });

  test("reports whether the atomic reservation was accepted", async () => {
    const accepted = await reserveAppTailorQuota(
      usageDb({ reservationChanges: 1 }),
      "user-1",
      "gemini",
      "gemini-3.1-flash-lite"
    );
    expect(accepted.ok).toBe(true);
    if (accepted.ok) expect(accepted.usageId).toBeString();

    const rejected = await reserveAppTailorQuota(
      usageDb({ reservationChanges: 0 }),
      "user-1",
      "gemini",
      "gemini-3.1-flash-lite"
    );
    expect(rejected.ok).toBe(false);
    if (!rejected.ok) expect(rejected.resets_at).toEndWith("T00:00:00.000Z");
  });

  test("reports Workers AI neurons separately from the per-user use count", async () => {
    const usage = await loadTailorUsage({
      db: usageDb({ appCount: 3, userCount: 2, includedUserCount: 2, providerUnits: 274.5 }),
      userId: "user-1",
      provider: "workers_ai",
      model: "@cf/zai-org/glm-4.7-flash",
    });

    expect(usage.included_user_remaining).toBe(13);
    expect(usage.provider_units_today).toBe(274.5);
    expect(usage.provider_units_limit).toBe(10_000);
    expect(usage.provider_units_remaining).toBe(9_725.5);
  });
});
