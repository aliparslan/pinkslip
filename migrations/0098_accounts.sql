-- Step 6, accounts (docs/backend-inventory-2026-10-16.md, Decisions:
-- Accounts): Google sign-in, email and password, and sign-in by code.
--
-- auth_identities only allowed 'apple' and 'email', so it's rebuilt to allow
-- 'google' and to hold a password's one-way hash on an email identity.
-- apple_refresh_tokens points at it with ON DELETE CASCADE, and dropping the
-- old table deletes those rows, so they're copied aside and put back.
-- Rehearsed on a copy of production's tables before it ran (Decisions say to
-- for a rebuild); take a D1 restore point before applying it remotely.

PRAGMA defer_foreign_keys = true;

CREATE TABLE apple_refresh_tokens_0098 AS SELECT * FROM apple_refresh_tokens;

CREATE TABLE auth_identities_0098 (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('apple', 'email', 'google')),
  provider_subject TEXT NOT NULL,
  email TEXT,
  email_verified INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_used_at TEXT,
  -- Email identities only: PBKDF2-SHA256 ("pbkdf2-sha256$<iterations>$<salt>$<hash>").
  password_hash TEXT,
  password_updated_at TEXT
);

INSERT INTO auth_identities_0098 (
  id, user_id, provider, provider_subject, email, email_verified, created_at, last_used_at
)
SELECT id, user_id, provider, provider_subject, email, email_verified, created_at, last_used_at
FROM auth_identities;

DROP TABLE auth_identities;
ALTER TABLE auth_identities_0098 RENAME TO auth_identities;

CREATE UNIQUE INDEX idx_auth_identities_provider_subject ON auth_identities(provider, provider_subject);
CREATE INDEX idx_auth_identities_user ON auth_identities(user_id);
CREATE INDEX idx_auth_identities_email ON auth_identities(lower(email));

INSERT INTO apple_refresh_tokens SELECT * FROM apple_refresh_tokens_0098;
DROP TABLE apple_refresh_tokens_0098;

-- Sign-in by code: a 6-digit code mailed for sign-in, sign-up or a forgotten
-- password, beside the older links (which keep working for older builds).
ALTER TABLE email_login_tokens ADD COLUMN kind TEXT NOT NULL DEFAULT 'link';
ALTER TABLE email_login_tokens ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0;

-- Wrong passwords, for slowing down guessing.
CREATE TABLE password_attempts (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  request_ip TEXT,
  attempted_at TEXT NOT NULL
);
CREATE INDEX idx_password_attempts_email ON password_attempts(email, attempted_at);
CREATE INDEX idx_password_attempts_ip ON password_attempts(request_ip, attempted_at);

-- Google sign-in in progress: started from a session, finished once Google
-- sends the person back. The iPhone's sign-in sheet has no cookies, so the
-- flow lives here, bound to the session that started it.
CREATE TABLE oauth_flows (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL CHECK (provider IN ('google')),
  -- 'web' finishes in the callback; 'native' waits for the app to collect it.
  client TEXT NOT NULL CHECK (client IN ('web', 'native')),
  session_id TEXT NOT NULL,
  nonce TEXT NOT NULL,
  code_verifier TEXT NOT NULL,
  origin TEXT NOT NULL,
  -- The verified identity, once Google answered (native flows).
  result_json TEXT,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT
);
