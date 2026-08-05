-- The original global job score and its component columns have no readers or
-- writers after binary eligibility replaced ranking.
DROP INDEX IF EXISTS idx_jobs_score;
ALTER TABLE jobs DROP COLUMN score;
ALTER TABLE jobs DROP COLUMN title_score;
ALTER TABLE jobs DROP COLUMN yoe_score;
ALTER TABLE jobs DROP COLUMN location_score;
ALTER TABLE jobs DROP COLUMN department_score;
ALTER TABLE jobs DROP COLUMN recency_score;
