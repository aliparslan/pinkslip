-- Solutions architects and engineers had no role anyone could choose, so open jobs
-- with those titles reached no one. They're now their own opt-in role. Jobs a more
-- specific role already claims (a data or full-stack title, say) keep it.

UPDATE job_features
SET role_family = 'engineering', specialties_json = '["solutions"]'
WHERE specialties_json = '[]'
  AND job_id IN (
    SELECT id FROM jobs
    WHERE lower(title) LIKE '%solutions architect%'
       OR lower(title) LIKE '%solution architect%'
       OR lower(title) LIKE '%solutions engineer%'
       OR lower(title) LIKE '%solution engineer%'
       OR lower(title) LIKE '%sales engineer%'
       OR lower(title) LIKE '%pre-sales engineer%'
       OR lower(title) LIKE '%presales engineer%'
       OR lower(title) LIKE '%customer engineer%'
  );
