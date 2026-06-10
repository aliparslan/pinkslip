CREATE TABLE IF NOT EXISTS access_attempts (
  id TEXT PRIMARY KEY,
  request_ip TEXT NOT NULL,
  attempted_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_access_attempts_ip_time
  ON access_attempts(request_ip, attempted_at DESC);
