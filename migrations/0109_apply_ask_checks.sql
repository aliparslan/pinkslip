-- An ask waits for a check (owner, 2026-11-04; worker/apply/ask-checks.ts):
-- a strong match's form is filled once on the server without Submit, and
-- only a form Pinkslip can send asks. At most 5 asks a day.

-- The check's own dry run: kept out of the person's sends, and its browser
-- isn't held open after.
ALTER TABLE apply_sends ADD COLUMN for_ask INTEGER NOT NULL DEFAULT 0;

-- Two more states: checking (the dry run is filling the form; the job's
-- new-job alert waits) and skipped (never asked: the check failed or no
-- longer applied, and the alert went out as usual). SQLite can't change a
-- CHECK, so the table is rebuilt; nothing refers to it.
PRAGMA defer_foreign_keys = true;

CREATE TABLE apply_asks_rebuilt (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('checking', 'asked', 'applied', 'dismissed', 'sent', 'skipped')),
  send_id TEXT,
  notify_at TEXT,
  created_at TEXT NOT NULL,
  decided_at TEXT,
  UNIQUE (user_id, job_id)
);

INSERT INTO apply_asks_rebuilt (id, user_id, job_id, status, send_id, notify_at, created_at, decided_at)
  SELECT id, user_id, job_id, status, send_id, notify_at, created_at, decided_at FROM apply_asks;

DROP TABLE apply_asks;
ALTER TABLE apply_asks_rebuilt RENAME TO apply_asks;

CREATE INDEX IF NOT EXISTS idx_apply_asks_user ON apply_asks(user_id, created_at);
