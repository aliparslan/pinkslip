-- Failing company sources currently retry every 15 minutes forever. 46 of 221
-- enabled companies are permanently broken (dead Greenhouse/Ashby/Lever slugs),
-- which burns ~4,400 pointless upstream requests a day, inflates every poll
-- cycle's duration, and buries the signal that they need fixing.
--
-- Quarantine is a backoff, not a disable: a quarantined source is still retried
-- once every 24h, so a slug that gets fixed — or a board that reopens — heals
-- itself without anyone touching the database. `enabled` is deliberately left
-- alone so quarantine stays distinguishable from a company you turned off.
ALTER TABLE companies ADD COLUMN poll_failure_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE companies ADD COLUMN quarantined_at TEXT;

-- Backfill: anything already failing goes straight into quarantine rather than
-- waiting to accumulate three more failures. Their existing last_poll_error is
-- preserved, so the admin screen can show why each one is quarantined.
UPDATE companies
SET poll_failure_count = 3,
    quarantined_at = COALESCE(quarantined_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
WHERE enabled = 1
  AND last_poll_status = 'error';

CREATE INDEX IF NOT EXISTS idx_companies_quarantined
  ON companies(quarantined_at)
  WHERE quarantined_at IS NOT NULL;
