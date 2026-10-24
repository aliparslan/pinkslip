-- Step 9, plans and billing (docs/backend-inventory-2026-10-16.md, Plans and
-- billing): each person's plan, and a ledger of the allowance-metered things
-- that have no table of their own (auto-apply sends; tailoring keeps
-- tailor_usage). Payments come at the App Store release; until then admins
-- give Pro by hand.

-- One row per person once anything has set their plan; no row means Free.
CREATE TABLE IF NOT EXISTS user_plans (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  plan TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'pro')),
  -- Who set it: an admin, a free trial, Apple, or Stripe.
  source TEXT NOT NULL DEFAULT 'admin' CHECK (source IN ('admin', 'trial', 'apple', 'stripe')),
  -- The paid plan's length, for renewals and the Plan page.
  period TEXT CHECK (period IN ('week', 'month')),
  started_at TEXT NOT NULL,
  -- Pro lasts until here; null for an admin's Pro with no end.
  ends_at TEXT,
  will_renew INTEGER NOT NULL DEFAULT 0,
  -- The 3-day free trial is once per person (owner, 2026-10-24).
  trial_used_at TEXT,
  -- Apple's original transaction id or Stripe's subscription id.
  external_id TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS usage_ledger (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  -- What used it, such as the job an auto-apply send was for.
  ref_id TEXT,
  created_at TEXT NOT NULL,
  -- Set when the use didn't happen after all (a send that failed), so it
  -- stops counting.
  released_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_usage_ledger_user_kind ON usage_ledger(user_id, kind, created_at);
