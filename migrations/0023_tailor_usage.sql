CREATE TABLE IF NOT EXISTS tailor_usage (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  key_source TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tailor_usage_provider_model_created
  ON tailor_usage(provider, model, created_at);

CREATE INDEX IF NOT EXISTS idx_tailor_usage_user_created
  ON tailor_usage(user_id, created_at);
