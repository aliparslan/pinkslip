CREATE TABLE IF NOT EXISTS dismissed_jobs (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  dismissed_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, job_id)
);

INSERT OR IGNORE INTO dismissed_jobs (user_id, job_id, dismissed_at)
SELECT u.id, j.id, datetime('now')
FROM jobs j
JOIN users u ON 1 = 1
WHERE j.dismissed = 1;

UPDATE jobs
SET dismissed = 0
WHERE dismissed = 1;
