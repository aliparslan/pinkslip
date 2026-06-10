CREATE TABLE IF NOT EXISTS viewed_jobs (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  viewed_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, job_id)
);

CREATE INDEX IF NOT EXISTS idx_viewed_jobs_user_time
  ON viewed_jobs(user_id, viewed_at DESC);
