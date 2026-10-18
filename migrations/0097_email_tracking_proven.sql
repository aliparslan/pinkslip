-- Step 5, email tracking proven (docs/backend-inventory-2026-10-16.md,
-- Decisions: Email tracking).

-- Which way an email's step was read: the rules, or the AI fallback for
-- hiring mail the rules couldn't place (#2).
ALTER TABLE inbound_emails ADD COLUMN detected_by TEXT NOT NULL DEFAULT 'rules';
-- An interview time or deadline the email stated clearly (#3). Never the body.
ALTER TABLE inbound_emails ADD COLUMN detected_date TEXT;

-- 'email' when the stage's date came from an email ("from the email");
-- null when the person set it.
ALTER TABLE applications ADD COLUMN stage_date_source TEXT;

-- Forwarding stopped (#5): a steady stream of mail, then none for 3 weeks,
-- is what forwarding everything looks like when it breaks. One nudge per gap.
ALTER TABLE email_inboxes ADD COLUMN first_email_at TEXT;
ALTER TABLE email_inboxes ADD COLUMN email_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE email_inboxes ADD COLUMN forwarding_nudged_at TEXT;
UPDATE email_inboxes SET first_email_at = last_email_at, email_count = 1 WHERE last_email_at IS NOT NULL;

-- The AI fallback's calls per day, apart from Jev's own daily limit; its
-- cost goes into reported_cost_usd with the rest of the monthly budget.
ALTER TABLE classification_daily_budget ADD COLUMN email_calls INTEGER NOT NULL DEFAULT 0;
