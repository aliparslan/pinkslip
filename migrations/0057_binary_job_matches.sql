-- Matching is a binary eligibility decision. Rebuild the cache without score
-- components or explanation payloads; a version bump below intentionally
-- causes active users to be re-evaluated against the new policy.
CREATE TABLE user_job_matches_binary (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  matcher_version TEXT NOT NULL,
  matched_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, job_id)
);

DROP TABLE user_job_matches;
ALTER TABLE user_job_matches_binary RENAME TO user_job_matches;

CREATE INDEX idx_user_job_matches_feed
  ON user_job_matches(user_id, matched_at DESC, job_id);
CREATE INDEX idx_user_job_matches_job_id
  ON user_job_matches(job_id);
