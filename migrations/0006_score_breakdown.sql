-- Purge jobs older than 2 weeks (keep applied ones)
DELETE FROM jobs WHERE first_seen_at < datetime('now', '-14 days')
  AND id NOT IN (SELECT job_id FROM applications WHERE job_id IS NOT NULL);
