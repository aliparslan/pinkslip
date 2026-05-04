ALTER TABLE jobs ADD COLUMN closed_at TEXT;

CREATE TABLE IF NOT EXISTS blocked_jobs (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  external_id TEXT NOT NULL,
  title TEXT,
  blocked_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(company_id, external_id)
);
