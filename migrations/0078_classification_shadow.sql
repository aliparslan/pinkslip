-- Latest deterministic decision for every observed source row, including rejects.
CREATE TABLE source_job_decisions (
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  external_id TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  gate_version TEXT NOT NULL,
  reason TEXT NOT NULL,
  title TEXT NOT NULL,
  location TEXT NOT NULL,
  job_url TEXT NOT NULL,
  evaluated_at TEXT NOT NULL,
  PRIMARY KEY (company_id, external_id)
);
CREATE INDEX source_job_decisions_reason ON source_job_decisions(reason);

-- Separate from production job_features: these answers never affect delivery.
CREATE TABLE job_classification_shadow (
  cache_key TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  external_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  input_json TEXT,
  baseline_json TEXT NOT NULL DEFAULT '{}',
  truncated INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','running','complete','failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  queued_at TEXT NOT NULL,
  started_at TEXT,
  completed_at TEXT,
  answers_json TEXT,
  model TEXT,
  request_id TEXT,
  input_tokens INTEGER,
  output_tokens INTEGER,
  cost_usd REAL,
  latency_ms INTEGER,
  error_code TEXT
);
CREATE INDEX classification_shadow_pending ON job_classification_shadow(status, queued_at);
-- Enforce queue capacity in SQLite, including concurrent poll invocations.
CREATE TRIGGER classification_shadow_capacity BEFORE INSERT ON job_classification_shadow
WHEN (SELECT COUNT(*) FROM job_classification_shadow WHERE status IN ('pending','running')) >= 500
BEGIN SELECT RAISE(IGNORE); END;

CREATE TABLE classification_daily_budget (
  day TEXT PRIMARY KEY,
  calls INTEGER NOT NULL DEFAULT 0,
  reported_cost_usd REAL NOT NULL DEFAULT 0
);
