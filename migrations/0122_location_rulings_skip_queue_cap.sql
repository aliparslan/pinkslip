-- Jev's sample queue sits at its 500-row cap, which would silently drop the
-- location questions whose answers can admit a job. They get a cap of their own.

DROP TRIGGER classification_shadow_capacity;

CREATE TRIGGER classification_shadow_capacity BEFORE INSERT ON job_classification_shadow
WHEN (NEW.reason != 'location_ruling'
      AND (SELECT COUNT(*) FROM job_classification_shadow WHERE status IN ('pending','running')) >= 500)
  OR (NEW.reason = 'location_ruling'
      AND (SELECT COUNT(*) FROM job_classification_shadow WHERE status IN ('pending','running') AND reason = 'location_ruling') >= 500)
BEGIN SELECT RAISE(IGNORE); END;
