CREATE TABLE IF NOT EXISTS notification_match_backlog (
  job_id TEXT PRIMARY KEY REFERENCES jobs(id) ON DELETE CASCADE,
  queued_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_notification_match_backlog_queued
  ON notification_match_backlog(queued_at, job_id);
