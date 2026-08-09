ALTER TABLE tailorings ADD COLUMN schema_version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE tailorings ADD COLUMN status TEXT;
ALTER TABLE tailorings ADD COLUMN job_snapshot_json TEXT;
ALTER TABLE tailorings ADD COLUMN evidence_json TEXT;
ALTER TABLE tailorings ADD COLUMN requirements_json TEXT;
ALTER TABLE tailorings ADD COLUMN plan_json TEXT;
ALTER TABLE tailorings ADD COLUMN resume_draft_json TEXT;
ALTER TABLE tailorings ADD COLUMN validation_json TEXT;
ALTER TABLE tailorings ADD COLUMN template_version TEXT;
ALTER TABLE tailorings ADD COLUMN compiler_version TEXT;
ALTER TABLE tailorings ADD COLUMN updated_at TEXT;
ALTER TABLE tailorings ADD COLUMN usage_id TEXT;

CREATE TABLE IF NOT EXISTS tailored_resume_artifacts (
  id TEXT PRIMARY KEY,
  tailoring_id TEXT NOT NULL REFERENCES tailorings(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL,
  resume_json TEXT NOT NULL,
  validation_json TEXT NOT NULL,
  typst_source TEXT NOT NULL,
  template_version TEXT NOT NULL,
  compiler_version TEXT NOT NULL,
  pdf_storage_key TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(tailoring_id, revision)
);

CREATE INDEX IF NOT EXISTS idx_tailored_resume_artifacts_tailoring_revision
  ON tailored_resume_artifacts(tailoring_id, revision DESC);

CREATE INDEX IF NOT EXISTS idx_tailored_resume_artifacts_user_created
  ON tailored_resume_artifacts(user_id, created_at DESC);
