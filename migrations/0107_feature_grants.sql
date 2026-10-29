-- A feature opened to one person ahead of everyone else, while its flag is
-- admin-only (owner, 2026-10-29: sends for a tester, Sai). One row per
-- person and flag (worker/feature-flags.ts); delete it to take it back.

CREATE TABLE IF NOT EXISTS feature_grants (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  flag TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, flag)
);
