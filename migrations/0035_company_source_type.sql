ALTER TABLE companies ADD COLUMN source_type TEXT;

UPDATE companies
SET source_type = ats_type
WHERE source_type IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_companies_unique_effective_source
  ON companies(source_type, LOWER(TRIM(ats_slug)));
