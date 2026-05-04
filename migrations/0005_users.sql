CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Scope personal data to users
ALTER TABLE applications ADD COLUMN user_id TEXT REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE saved_jobs ADD COLUMN user_id TEXT REFERENCES users(id) ON DELETE CASCADE;

CREATE INDEX idx_applications_user ON applications(user_id);
CREATE INDEX idx_saved_jobs_user ON saved_jobs(user_id);

-- Update saved_jobs primary key to be (user_id, job_id)
-- SQLite doesn't support ALTER PRIMARY KEY, so we recreate
CREATE TABLE saved_jobs_new (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  saved_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, job_id)
);
INSERT INTO saved_jobs_new (user_id, job_id, saved_at)
  SELECT COALESCE(user_id, 'default'), job_id, saved_at FROM saved_jobs;
DROP TABLE saved_jobs;
ALTER TABLE saved_jobs_new RENAME TO saved_jobs;
