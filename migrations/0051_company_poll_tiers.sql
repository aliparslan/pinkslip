-- Polling every enabled source on every 15-minute tick does not survive the
-- catalog growing past a few hundred companies. Two independent ceilings bite:
-- the public ATS APIs throttle a single origin making hundreds of requests four
-- times an hour, and matching every newly-ingested job against every profile in
-- one invocation is what exhausted D1's CPU budget in June.
--
-- Tier 1 is the competitive set — the marquee direct-ATS employers where being
-- early actually matters. It is polled every cycle.
-- Tier 2 is the long tail, chiefly YC companies. It rotates: the poller already
-- orders by last_polled_at ascending, so a per-cycle cap drains it round-robin.
ALTER TABLE companies ADD COLUMN poll_tier INTEGER NOT NULL DEFAULT 1;

-- Records how many postings the last successful poll returned. A board that
-- answers HTTP 200 with an empty array is indistinguishable from a healthy one
-- in last_poll_status, which is how Shopify, Palo Alto Networks, Rivian and
-- Fanatics all read as "ok" on SmartRecruiters while delivering nothing.
ALTER TABLE companies ADD COLUMN last_poll_job_count INTEGER;

CREATE INDEX IF NOT EXISTS idx_companies_poll_rotation
  ON companies(poll_tier, last_polled_at);
