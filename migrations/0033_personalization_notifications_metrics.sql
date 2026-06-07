CREATE TABLE IF NOT EXISTS user_blocked_companies (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  blocked_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, company_id)
);

CREATE INDEX IF NOT EXISTS idx_user_blocked_companies_company
  ON user_blocked_companies(company_id, user_id);

CREATE TABLE IF NOT EXISTS content_reports (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_id TEXT REFERENCES companies(id) ON DELETE SET NULL,
  job_id TEXT REFERENCES jobs(id) ON DELETE SET NULL,
  report_type TEXT NOT NULL CHECK (
    report_type IN ('broken_source', 'expired_listing', 'incorrect_details', 'duplicate_listing', 'other')
  ),
  notes TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'dismissed')),
  admin_response TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_content_reports_status_created
  ON content_reports(status, created_at DESC);

CREATE TABLE IF NOT EXISTS user_notification_settings (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  enabled INTEGER NOT NULL DEFAULT 0,
  push_enabled INTEGER NOT NULL DEFAULT 1,
  threshold INTEGER NOT NULL DEFAULT 50 CHECK (threshold BETWEEN 0 AND 100),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO user_notification_settings (
  user_id, enabled, push_enabled, threshold, updated_at
)
SELECT
  user_id,
  notifications_enabled,
  1,
  match_threshold,
  updated_at
FROM user_search_profiles;

CREATE TABLE IF NOT EXISTS notification_candidates (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  channel TEXT NOT NULL DEFAULT 'push',
  score INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'sending', 'sent', 'retry', 'failed', 'skipped')
  ),
  attempt_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_attempt_at TEXT,
  sent_at TEXT,
  opened_at TEXT,
  UNIQUE(user_id, job_id, channel)
);

CREATE INDEX IF NOT EXISTS idx_notification_candidates_delivery
  ON notification_candidates(status, created_at);

CREATE INDEX IF NOT EXISTS idx_notification_candidates_user
  ON notification_candidates(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS product_events (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  session_id TEXT,
  event_name TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  properties_json TEXT NOT NULL DEFAULT '{}',
  occurred_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_product_events_name_time
  ON product_events(event_name, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_product_events_user_time
  ON product_events(user_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS scorer_rollouts (
  scorer_version TEXT PRIMARY KEY,
  mode TEXT NOT NULL DEFAULT 'shadow' CHECK (mode IN ('off', 'shadow', 'active')),
  cohort_percent INTEGER NOT NULL DEFAULT 0 CHECK (cohort_percent BETWEEN 0 AND 100),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS scorer_audits (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  stable_version TEXT NOT NULL,
  candidate_version TEXT NOT NULL,
  stable_score INTEGER NOT NULL,
  candidate_score INTEGER NOT NULL,
  delta INTEGER NOT NULL,
  reasons_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, job_id, candidate_version)
);

CREATE INDEX IF NOT EXISTS idx_scorer_audits_candidate_time
  ON scorer_audits(candidate_version, created_at DESC);

INSERT OR IGNORE INTO scorer_rollouts (scorer_version, mode, cohort_percent)
VALUES ('profile-v2-shadow-1', 'shadow', 100);
