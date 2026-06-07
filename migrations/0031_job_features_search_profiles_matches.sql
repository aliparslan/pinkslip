CREATE TABLE IF NOT EXISTS job_features (
  job_id TEXT PRIMARY KEY REFERENCES jobs(id) ON DELETE CASCADE,
  role_family TEXT NOT NULL,
  specialties_json TEXT NOT NULL DEFAULT '[]',
  seniority TEXT NOT NULL,
  min_years INTEGER,
  max_years INTEGER,
  work_mode TEXT NOT NULL,
  countries_json TEXT NOT NULL DEFAULT '[]',
  metro_areas_json TEXT NOT NULL DEFAULT '[]',
  salary_min INTEGER,
  salary_max INTEGER,
  salary_currency TEXT,
  salary_period TEXT,
  classifier_version TEXT NOT NULL,
  confidence REAL NOT NULL,
  source_updated_at TEXT,
  classified_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_job_features_role
  ON job_features(role_family, seniority, work_mode);

CREATE TABLE IF NOT EXISTS user_search_profiles (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  profile_json TEXT NOT NULL,
  match_threshold INTEGER NOT NULL DEFAULT 50,
  notifications_enabled INTEGER NOT NULL DEFAULT 0,
  onboarding_version INTEGER NOT NULL DEFAULT 0,
  onboarding_completed_at TEXT,
  match_cursor_seen_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS user_job_matches (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  score INTEGER NOT NULL,
  title_score INTEGER NOT NULL,
  yoe_score INTEGER NOT NULL,
  location_score INTEGER NOT NULL,
  department_score INTEGER NOT NULL,
  recency_score INTEGER NOT NULL,
  reasons_json TEXT NOT NULL DEFAULT '[]',
  scorer_version TEXT NOT NULL,
  matched_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, job_id)
);

CREATE INDEX IF NOT EXISTS idx_user_job_matches_feed
  ON user_job_matches(user_id, score DESC, job_id);
