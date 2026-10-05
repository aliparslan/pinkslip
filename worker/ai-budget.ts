import { notifyAdmins } from "./admin-alerts";
import type { NotificationPayload } from "./push";
import type { Env } from "./types";

// Cloudflare bills Workers AI without any spending cap, so this monthly budget
// is the only thing standing between a runaway loop and the bill. Paid model
// calls record their cost per day in classification_daily_budget; once the
// calendar month's total reaches the budget, optional AI work stops until the
// 1st. Jev is the only metered caller today. Job alerts never depend on it.

export const DEFAULT_AI_MONTHLY_BUDGET_USD = 10;

/** Admins hear about spend once per threshold per month. */
const ALERT_THRESHOLDS = [0.5, 0.8, 1] as const;

const STATE_KEY = "ai_budget_alerts";

export interface AiBudgetStatus {
  month: string;
  budgetUsd: number;
  spentUsd: number;
  exhausted: boolean;
}

/** Unset uses the default; an unreadable value fails closed at $0. */
export function aiMonthlyBudgetUsd(value?: string): number {
  if (value === undefined || value.trim() === "") return DEFAULT_AI_MONTHLY_BUDGET_USD;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

export async function aiBudgetStatus(env: Env, now = new Date()): Promise<AiBudgetStatus> {
  const month = now.toISOString().slice(0, 7);
  const budgetUsd = aiMonthlyBudgetUsd(env.AI_MONTHLY_BUDGET_USD);
  const row = await env.DB.prepare(
    `SELECT COALESCE(SUM(reported_cost_usd), 0) AS spent
     FROM classification_daily_budget
     WHERE substr(day, 1, 7) = ?`
  ).bind(month).first<{ spent: number }>();
  const spentUsd = row?.spent ?? 0;
  return { month, budgetUsd, spentUsd, exhausted: spentUsd >= budgetUsd };
}

export function buildAiBudgetAlertPayload(status: AiBudgetStatus, threshold: number): NotificationPayload {
  const used = `$${status.spentUsd.toFixed(2)} of $${status.budgetUsd.toFixed(2)} used this month.`;
  return threshold >= 1
    ? {
        title: "AI spending paused for the month",
        body: `${used} Jev comparisons resume on the 1st.`,
        data: { url: "/admin" },
      }
    : {
        title: `AI spending at ${Math.round(threshold * 100)}% of budget`,
        body: `${used} Jev comparisons stop at the limit.`,
        data: { url: "/admin" },
      };
}

export async function alertOnAiBudget(
  env: Env,
  status: AiBudgetStatus,
  alert: typeof notifyAdmins = notifyAdmins
): Promise<void> {
  // A $0 budget is a deliberate pause, not news.
  if (status.budgetUsd <= 0) return;
  const crossed = ALERT_THRESHOLDS.filter((threshold) => status.spentUsd >= status.budgetUsd * threshold).at(-1);
  if (crossed === undefined) return;

  const db = env.DB;
  const stored = await db.prepare("SELECT value FROM preferences WHERE key = ?")
    .bind(STATE_KEY)
    .first<{ value: string }>();
  let previous: { month: string; threshold: number } | null = null;
  try {
    previous = stored ? JSON.parse(stored.value) : null;
  } catch {
    previous = null;
  }
  if (previous?.month === status.month && previous.threshold >= crossed) return;

  await alert(db, env, buildAiBudgetAlertPayload(status, crossed));
  await db.prepare(
    `INSERT INTO preferences (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).bind(STATE_KEY, JSON.stringify({ month: status.month, threshold: crossed })).run();
}
