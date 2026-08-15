-- Artifact history is retained until the user explicitly deletes it. Integrity
-- metadata makes every exported revision independently verifiable, while the
-- selection table records the single revision the user has approved for later
-- supervised application work.
ALTER TABLE tailored_resume_artifacts ADD COLUMN page_count INTEGER;
ALTER TABLE tailored_resume_artifacts ADD COLUMN pdf_sha256 TEXT;
ALTER TABLE tailored_resume_artifacts ADD COLUMN resume_sha256 TEXT;
ALTER TABLE tailored_resume_artifacts ADD COLUMN typst_sha256 TEXT;
ALTER TABLE tailored_resume_artifacts ADD COLUMN provenance_sha256 TEXT;
ALTER TABLE tailored_resume_artifacts ADD COLUMN extracted_text_sha256 TEXT;
ALTER TABLE tailored_resume_artifacts ADD COLUMN pdf_byte_size INTEGER;
ALTER TABLE tailored_resume_artifacts ADD COLUMN compiler_origin TEXT NOT NULL DEFAULT 'client'
  CHECK (compiler_origin IN ('client', 'service'));
ALTER TABLE tailored_resume_artifacts ADD COLUMN verification_status TEXT NOT NULL DEFAULT 'client_only'
  CHECK (verification_status IN ('client_only', 'server_reproduced', 'server_content_matched'));
ALTER TABLE tailored_resume_artifacts ADD COLUMN retention_policy TEXT NOT NULL DEFAULT 'until_deleted'
  CHECK (retention_policy = 'until_deleted');
ALTER TABLE tailored_resume_artifacts ADD COLUMN storage_state TEXT NOT NULL DEFAULT 'available'
  CHECK (storage_state IN ('available', 'deleting', 'missing', 'corrupt'));
ALTER TABLE tailored_resume_artifacts ADD COLUMN delete_requested_at TEXT;

CREATE INDEX idx_tailored_resume_artifacts_user_storage
  ON tailored_resume_artifacts(user_id, storage_state, created_at DESC);

CREATE TABLE tailoring_artifact_selections (
  tailoring_id TEXT PRIMARY KEY REFERENCES tailorings(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  artifact_id TEXT NOT NULL UNIQUE REFERENCES tailored_resume_artifacts(id) ON DELETE CASCADE,
  selected_at TEXT NOT NULL
);

CREATE INDEX idx_tailoring_artifact_selections_user
  ON tailoring_artifact_selections(user_id, selected_at DESC);

-- A reservation accounts for in-flight provider work. Refunding changes the
-- user's included-use count, not the provider cost already incurred.
ALTER TABLE tailor_usage ADD COLUMN state TEXT NOT NULL DEFAULT 'completed'
  CHECK (state IN ('reserved', 'completed', 'refunded'));
ALTER TABLE tailor_usage ADD COLUMN reserved_provider_units REAL NOT NULL DEFAULT 0;
ALTER TABLE tailor_usage ADD COLUMN attempt_count INTEGER NOT NULL DEFAULT 1;
ALTER TABLE tailor_usage ADD COLUMN completed_at TEXT;
ALTER TABLE tailor_usage ADD COLUMN refunded_at TEXT;
ALTER TABLE tailor_usage ADD COLUMN failure_stage TEXT;
ALTER TABLE tailor_usage ADD COLUMN failure_code TEXT;

UPDATE tailor_usage
SET state = 'completed',
    completed_at = COALESCE(completed_at, created_at),
    provider_units = COALESCE(provider_units, 0),
    reserved_provider_units = 0,
    attempt_count = CASE WHEN attempt_count < 1 THEN 1 ELSE attempt_count END;

ALTER TABLE tailorings ADD COLUMN initial_resume_json TEXT;

CREATE TABLE tailoring_quality_events (
  id TEXT PRIMARY KEY,
  tailoring_id TEXT REFERENCES tailorings(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  stage TEXT NOT NULL,
  outcome TEXT NOT NULL,
  duration_ms INTEGER,
  input_tokens INTEGER,
  output_tokens INTEGER,
  repaired INTEGER,
  requirement_count INTEGER,
  requirement_source_count INTEGER,
  matched_requirement_count INTEGER,
  gap_count INTEGER,
  selected_evidence_count INTEGER,
  bullet_count INTEGER,
  validation_issue_count INTEGER,
  unsupported_claim_count INTEGER,
  page_count INTEGER,
  removed_item_count INTEGER,
  edited_bullet_count INTEGER,
  baseline_bullet_count INTEGER,
  error_code TEXT,
  compiler_origin TEXT,
  verification_status TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_tailoring_quality_events_created
  ON tailoring_quality_events(created_at DESC);

CREATE INDEX idx_tailoring_quality_events_tailoring
  ON tailoring_quality_events(tailoring_id, created_at DESC);
