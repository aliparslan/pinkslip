import { describe, expect, test } from "bun:test";
import {
  loadTailorUsage,
  nextUtcDay,
  reserveAppTailorQuota,
} from "@worker/tailor/usage";

function usageDb(args: { appCount?: number; userCount?: number; reservationChanges?: number }) {
  return {
    prepare(sql: string) {
      const statement = {
        bind() {
          return statement;
        },
        async first<T>() {
          const count = sql.includes("key_source = 'app'")
            ? args.appCount ?? 0
            : args.userCount ?? 0;
          return { count } as T;
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
    const usage = await loadTailorUsage({
      db: usageDb({ appCount: 10, userCount: 4 }),
      userId: "user-1",
      provider: "gemini",
      model: "gemini-3.1-flash-lite",
    });

    expect(usage.app_remaining).toBe(490);
    expect(usage.user_remaining).toBe(11);
    expect(usage.daily_limit).toBe(500);
  });

  test("returns the next UTC boundary, including month rollover", () => {
    expect(nextUtcDay(new Date("2026-07-31T23:59:59.000Z"))).toBe("2026-08-01T00:00:00.000Z");
  });

  test("reports whether the atomic reservation was accepted", async () => {
    expect(await reserveAppTailorQuota(
      usageDb({ reservationChanges: 1 }),
      "user-1",
      "gemini",
      "gemini-3.1-flash-lite"
    )).toEqual({ ok: true });

    const rejected = await reserveAppTailorQuota(
      usageDb({ reservationChanges: 0 }),
      "user-1",
      "gemini",
      "gemini-3.1-flash-lite"
    );
    expect(rejected.ok).toBe(false);
    if (!rejected.ok) expect(rejected.resets_at).toEndWith("T00:00:00.000Z");
  });
});
