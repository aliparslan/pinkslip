-- Solutions architect jobs had no role anyone could choose, so they reached no one.
-- They now count as forward deployed work, for jobs already in the catalog as well
-- as new ones. The seniority rules still apply.

UPDATE job_features
SET role_family = 'engineering', specialties_json = '["forward_deployed"]'
WHERE role_family = 'other'
  AND job_id IN (
    SELECT id FROM jobs
    WHERE lower(title) LIKE '%solutions architect%'
       OR lower(title) LIKE '%solution architect%'
  );
