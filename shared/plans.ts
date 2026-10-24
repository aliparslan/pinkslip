/** Free and Pro (owner, 2026-10-24; docs/backend-inventory-2026-10-16.md,
 * Plans and billing, and docs/pricing-costs-2026-10-24.md). Everything that
 * keeps a search organized is free; Pro lifts the weekly allowances. */

export type PlanName = "free" | "pro";

/** Who set someone's Pro. */
export type PlanSource = "admin" | "trial" | "apple" | "stripe";

export type AllowanceKind = "auto_apply_send" | "tailoring";

export interface AllowanceRule {
  limit: number;
  /** Resets at local midnight, or Monday's for a week. */
  per: "day" | "week";
  /** A fair-use ceiling against runaway loops, not a limit to show. */
  quiet?: boolean;
}

export const PLAN_ALLOWANCES: Record<PlanName, Record<AllowanceKind, AllowanceRule>> = {
  free: {
    auto_apply_send: { limit: 3, per: "week" },
    tailoring: { limit: 3, per: "week" },
  },
  pro: {
    // No per-company limit (owner, 2026-10-24).
    auto_apply_send: { limit: 10, per: "day" },
    tailoring: { limit: 50, per: "week", quiet: true },
  },
};

/** What each allowance is for, under its count on the Plan page. */
export const ALLOWANCE_LABELS: Record<AllowanceKind, string> = {
  auto_apply_send: "applied for you",
  tailoring: "tailored resumes",
};

/** The same on iPhone and the web (owner, 2026-10-24). The App Store and
 * Stripe hold the real prices; these are for the Plan page and the web. */
export const PRO_PRICES_USD = { week: 5, month: 15 } as const;

/** A free trial of Pro, once per person: Apple's introductory offer on the
 * subscription. */
export const PRO_TRIAL_DAYS = 3;

/** Pro's subscriptions in App Store Connect, one group ("Pinkslip Pro"),
 * and the length each sells. Apple is the only way to buy Pro for now
 * (owner, 2026-10-24). */
export const APPLE_PRO_PRODUCTS: Record<string, "week" | "month"> = {
  "dev.alip.pinkslip.pro.weekly": "week",
  "dev.alip.pinkslip.pro.monthly": "month",
};

export interface Allowance {
  kind: AllowanceKind;
  label: string;
  used: number;
  limit: number;
  per: AllowanceRule["per"];
  quiet: boolean;
  /** When it starts again: the next local midnight, or Monday's. */
  resets_at: string;
}

/** GET /api/v2/plan. */
export interface PlanState {
  plan: PlanName;
  source: PlanSource | null;
  /** The paid plan's length. */
  period: "week" | "month" | null;
  /** When Pro ends unless it renews; null for Free or a Pro with no end. */
  ends_at: string | null;
  will_renew: boolean;
  trial: { available: boolean; days: number };
  prices: { currency: "usd"; week: number; month: number };
  allowances: Allowance[];
  /** "Got the job? Pro ends here": on Pro, the latest application at Offer,
   * for the app to offer ending Pro (owner, 2026-10-24). */
  offer_application: { id: string; company_name: string | null } | null;
}
