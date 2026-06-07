CREATE TABLE IF NOT EXISTS user_job_scores (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  score INTEGER NOT NULL,
  title_score INTEGER NOT NULL,
  yoe_score INTEGER NOT NULL,
  location_score INTEGER NOT NULL,
  department_score INTEGER NOT NULL,
  recency_score INTEGER NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, job_id)
);

CREATE INDEX IF NOT EXISTS idx_user_job_scores_feed
  ON user_job_scores(user_id, score DESC, job_id);
