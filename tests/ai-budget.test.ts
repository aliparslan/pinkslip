import { describe, expect, it } from "bun:test";
import {
  aiBudgetStatus,
  aiMonthlyBudgetUsd,
  alertOnAiBudget,
  DEFAULT_AI_MONTHLY_BUDGET_USD,
} from "@worker/ai-budget";
import type { NotificationPayload } from "@worker/push";
import type { Env } from "@worker/types";
import { sqliteD1 } from "./sqlite-d1";

const NOW = new Date("2026-10-20T12:00:00.000Z");

function budgetEnv(budget?: string) {
  const { sqlite, db } = sqliteD1();
  sqlite.exec(`
    CREATE TABLE classification_daily_budget (
      day TEXT PRIMARY KEY, calls INTEGER NOT NULL DEFAULT 0, reported_cost_usd REAL NOT NULL DEFAULT 0
    );
    CREATE TABLE preferences (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  `);
  const spend = (day: string, usd: number) =>
    sqlite.run("INSERT INTO classification_daily_budget (day, calls, reported_cost_usd) VALUES (?, 1, ?)", [day, usd]);
  return { env: { DB: db, AI_MONTHLY_BUDGET_USD: budget } as Env, spend };
}

function recorder() {
  const alerts: NotificationPayload[] = [];
  return {
    alerts,
    alert: async (_db: D1Database, _env: Env, payload: NotificationPayload) => {
      alerts.push(payload);
      return 1;
    },
  };
}

describe("aiMonthlyBudgetUsd", () => {
  it("defaults when unset and fails closed when unreadable", () => {
    expect(aiMonthlyBudgetUsd(undefined)).toBe(DEFAULT_AI_MONTHLY_BUDGET_USD);
    expect(aiMonthlyBudgetUsd("")).toBe(DEFAULT_AI_MONTHLY_BUDGET_USD);
    expect(aiMonthlyBudgetUsd("25")).toBe(25);
    expect(aiMonthlyBudgetUsd("ten")).toBe(0);
    expect(aiMonthlyBudgetUsd("-5")).toBe(0);
  });
});

describe("aiBudgetStatus", () => {
  it("sums only the current calendar month", async () => {
    const { env, spend } = budgetEnv("10");
    spend("2026-09-30", 9);
    spend("2026-10-01", 2);
    spend("2026-10-19", 3.5);
    expect(await aiBudgetStatus(env, NOW)).toEqual({
      month: "2026-10", budgetUsd: 10, spentUsd: 5.5, exhausted: false,
    });
    spend("2026-10-20", 4.5);
    expect((await aiBudgetStatus(env, NOW)).exhausted).toBe(true);
  });
});

describe("alertOnAiBudget", () => {
  it("alerts once per threshold per month", async () => {
    const { env, spend } = budgetEnv("10");
    const { alerts, alert } = recorder();
    const check = async () => alertOnAiBudget(env, await aiBudgetStatus(env, NOW), alert);

    spend("2026-10-01", 4);
    await check();
    expect(alerts).toHaveLength(0);

    spend("2026-10-02", 1.2);
    await check();
    await check();
    expect(alerts.map((payload) => payload.title)).toEqual(["AI spending at 50% of budget"]);

    // Jumping past two thresholds sends only the highest.
    spend("2026-10-03", 5);
    await check();
    expect(alerts.at(-1)).toEqual({
      title: "AI spending paused for the month",
      body: "$10.20 of $10.00 used this month. Jev comparisons resume on the 1st.",
      data: { url: "/admin" },
    });
    await check();
    expect(alerts).toHaveLength(2);

    // A new month starts over.
    spend("2026-11-01", 6);
    await alertOnAiBudget(env, await aiBudgetStatus(env, new Date("2026-11-02T00:00:00Z")), alert);
    expect(alerts.at(-1)?.title).toBe("AI spending at 50% of budget");
  });

  it("stays quiet when the budget is deliberately zero", async () => {
    const { env } = budgetEnv("0");
    const { alerts, alert } = recorder();
    await alertOnAiBudget(env, await aiBudgetStatus(env, NOW), alert);
    expect(alerts).toHaveLength(0);
  });
});
