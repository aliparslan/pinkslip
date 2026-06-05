CREATE TABLE IF NOT EXISTS auth_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  state TEXT NOT NULL CHECK (state IN ('guest', 'authenticated')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  last_seen_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_auth_sessions_user
  ON auth_sessions(user_id);

CREATE INDEX IF NOT EXISTS idx_auth_sessions_state
  ON auth_sessions(state, expires_at);

CREATE TABLE IF NOT EXISTS auth_identities (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('apple', 'email')),
  provider_subject TEXT NOT NULL,
  email TEXT,
  email_verified INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_used_at TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_auth_identities_provider_subject
  ON auth_identities(provider, provider_subject);

CREATE INDEX IF NOT EXISTS idx_auth_identities_user
  ON auth_identities(user_id);

CREATE TABLE IF NOT EXISTS email_login_tokens (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  redirect_uri TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS user_preferences (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, key)
);

CREATE INDEX IF NOT EXISTS idx_user_preferences_user
  ON user_preferences(user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS user_profiles (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  data TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

ALTER TABLE corpus_versions ADD COLUMN user_id TEXT REFERENCES users(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_corpus_versions_user_updated
  ON corpus_versions(user_id, updated_at DESC, id DESC);

ALTER TABLE tailorings ADD COLUMN user_id TEXT REFERENCES users(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_tailorings_user_job_created
  ON tailorings(user_id, job_id, created_at DESC);

CREATE TABLE IF NOT EXISTS resume_assets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size INTEGER NOT NULL,
  uploaded_at TEXT NOT NULL DEFAULT (datetime('now')),
  storage_key TEXT NOT NULL,
  extracted_text TEXT,
  is_active INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_resume_assets_user_uploaded
  ON resume_assets(user_id, uploaded_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_resume_assets_active_per_user
  ON resume_assets(user_id)
  WHERE is_active = 1;

CREATE TABLE IF NOT EXISTS account_merge_backups (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  label TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_account_merge_backups_user
  ON account_merge_backups(user_id, created_at DESC);
