-- Queue-based source polling. A once-a-minute dispatcher claims sources whose
-- tier cadence has elapsed and hands each one to its own queue consumer
-- invocation, so a slow or huge board no longer shares one cron invocation's
-- CPU, memory, and subrequest budget with every other source.
--
-- poll_claimed_at marks a source as handed to the queue. It stops the next
-- dispatcher tick from enqueueing the same source again while its poll is
-- still running, and doubles as an idempotency token: a consumer only polls
-- when the message's claim matches the row. A claim older than the consumer's
-- maximum wall time is treated as lost and the source becomes claimable again.
ALTER TABLE companies ADD COLUMN poll_claimed_at TEXT;

-- One row per source poll from either path. It is the measured baseline for
-- poll cadence before and after a tier moves onto the queue, and what the
-- admin latency view and the polling watchdog read.
CREATE TABLE IF NOT EXISTS source_polls (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  poll_tier INTEGER NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('cron', 'queue')),
  status TEXT NOT NULL CHECK (status IN ('ok', 'error')),
  previous_polled_at TEXT,
  started_at TEXT NOT NULL,
  finished_at TEXT NOT NULL,
  new_jobs INTEGER NOT NULL DEFAULT 0,
  error TEXT
);

CREATE INDEX IF NOT EXISTS idx_source_polls_started
  ON source_polls(started_at);
