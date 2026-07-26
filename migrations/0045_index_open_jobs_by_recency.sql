-- The poller, feed and backlog scorer all ask the same question: "open jobs at
-- enabled companies, newest first". idx_jobs_first_seen alone could not serve it
-- because every query wrapped the column in datetime(), and even unwrapped it
-- does not cover the closed_at predicate — so SQLite still had to visit every
-- row to discard closed ones. Leading with closed_at lets the open set be an
-- index range scan that is already in first_seen_at order.
CREATE INDEX IF NOT EXISTS idx_jobs_open_recent
  ON jobs(closed_at, first_seen_at DESC);

-- The closed-job purge filters on closed_at alone.
CREATE INDEX IF NOT EXISTS idx_jobs_closed_at
  ON jobs(closed_at)
  WHERE closed_at IS NOT NULL;

-- advanceBacklogScoring picks the least-recently-updated profiles that still
-- have a backlog cursor set.
CREATE INDEX IF NOT EXISTS idx_user_search_profiles_cursor
  ON user_search_profiles(match_cursor_seen_at, updated_at)
  WHERE match_cursor_seen_at IS NOT NULL;
