CREATE TABLE IF NOT EXISTS feedback_submissions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  submission_type TEXT NOT NULL CHECK (
    submission_type IN ('company_request', 'feature_request', 'general_feedback')
  ),
  title TEXT NOT NULL,
  details TEXT NOT NULL DEFAULT '',
  careers_url TEXT,
  status TEXT NOT NULL DEFAULT 'new' CHECK (
    status IN ('new', 'planned', 'resolved', 'declined')
  ),
  admin_response TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_feedback_submissions_status_created
  ON feedback_submissions(status, created_at DESC);

