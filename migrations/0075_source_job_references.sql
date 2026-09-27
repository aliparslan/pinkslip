-- Complete reference-only sources (currently Meta) need to remember every
-- successfully inspected upstream ID, including jobs rejected by Pinkslip's
-- filters. Otherwise the same rejected rows consume the bounded detail budget
-- every poll and can delay a genuinely new posting.
CREATE TABLE IF NOT EXISTS source_job_references (
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  external_id TEXT NOT NULL,
  job_url TEXT NOT NULL,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  PRIMARY KEY (company_id, external_id)
);

CREATE INDEX IF NOT EXISTS idx_source_job_references_last_seen
  ON source_job_references(company_id, last_seen_at);
