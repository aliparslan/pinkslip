CREATE UNIQUE INDEX IF NOT EXISTS idx_companies_unique_source
  ON companies(ats_type, LOWER(TRIM(ats_slug)));
