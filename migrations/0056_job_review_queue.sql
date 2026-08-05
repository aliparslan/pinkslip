-- Machine uncertainty is kept out of the consumer feed until an admin makes a
-- durable per-job decision. Decisions live in data, not code, so approving or
-- rejecting a posting never requires a deployment. The reason codes, evidence,
-- classifier version, and admin note form a small labeled corpus for improving
-- later classifier versions.
CREATE TABLE IF NOT EXISTS job_review_queue (
  job_id TEXT PRIMARY KEY REFERENCES jobs(id) ON DELETE CASCADE,
  state TEXT NOT NULL DEFAULT 'needs_review'
    CHECK (state IN ('needs_review', 'approved', 'rejected')),
  reason_codes_json TEXT NOT NULL DEFAULT '[]',
  evidence_json TEXT NOT NULL DEFAULT '{}',
  classifier_version TEXT NOT NULL,
  admin_note TEXT,
  reviewed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  reviewed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_job_review_queue_state_updated
  ON job_review_queue(state, updated_at DESC);
