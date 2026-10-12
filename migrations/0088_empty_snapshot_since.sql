-- A board that answers with an empty, well-formed snapshot while Pinkslip still
-- has open jobs for it used to fail every poll forever: the guard against a bad
-- upstream response never let those jobs close, so the source stayed in
-- quarantine and its stale jobs stayed in the feed. The poller now records when
-- the board first came back empty and believes it once it has stayed empty for
-- a day (EMPTY_SNAPSHOT_SETTLE_MS in worker/poller.ts). Any non-empty snapshot
-- clears the timestamp.
ALTER TABLE companies ADD COLUMN empty_snapshot_since TEXT;

-- Sources already stuck on this error start their day from when they were
-- quarantined (or last polled), so they recover on their next daily retry
-- instead of waiting another 24 hours.
UPDATE companies
SET empty_snapshot_since = COALESCE(quarantined_at, last_polled_at)
WHERE last_poll_status = 'error'
  AND last_poll_error LIKE 'Source returned an empty snapshot while %';
