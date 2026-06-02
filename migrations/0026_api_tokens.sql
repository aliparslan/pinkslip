-- Bearer tokens for native clients (iOS app + its WidgetKit / Share extensions),
-- which run in separate processes and cannot share the WebView's cookie jar.
-- A token is minted from an authenticated cookie session via POST /api/auth/token
-- and stored in the app's shared (App Group) Keychain.
CREATE TABLE IF NOT EXISTS api_tokens (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_used_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_api_tokens_user ON api_tokens(user_id);
