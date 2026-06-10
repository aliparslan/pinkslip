-- Prevent duplicate applications for the same job (two concurrent creates could
-- both pass the "does it exist?" check and insert). Dedupe existing rows first
-- (keep the most recently updated), then enforce uniqueness per (user_id, job_id).
DELETE FROM applications
WHERE job_id IS NOT NULL
  AND id NOT IN (
    SELECT id FROM (
      SELECT id, ROW_NUMBER() OVER (
        PARTITION BY user_id, job_id ORDER BY datetime(updated_at) DESC, id
      ) AS rn
      FROM applications WHERE job_id IS NOT NULL
    ) ranked WHERE rn = 1
  );

CREATE UNIQUE INDEX IF NOT EXISTS idx_applications_user_job
  ON applications(user_id, job_id) WHERE job_id IS NOT NULL;
