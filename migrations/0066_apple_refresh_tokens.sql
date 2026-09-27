-- Store Sign in with Apple refresh tokens encrypted at the application layer so
-- account deletion can revoke Apple's authorization before removing user data.
CREATE TABLE apple_refresh_tokens (
  identity_id TEXT PRIMARY KEY REFERENCES auth_identities(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  encrypted_token TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_apple_refresh_tokens_user
  ON apple_refresh_tokens(user_id, updated_at DESC);
