-- Deleting a job invokes foreign-key actions in every child table. Most of
-- these tables use (user_id, job_id) as their primary key, which cannot answer
-- a lookup by job_id alone; SQLite therefore scanned the entire child table for
-- every deleted job. These reverse indexes make the bounded closed-job purge a
-- set of direct lookups instead.
CREATE INDEX IF NOT EXISTS idx_applications_job_id
  ON applications(job_id) WHERE job_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_saved_jobs_job_id
  ON saved_jobs(job_id);
CREATE INDEX IF NOT EXISTS idx_dismissed_jobs_job_id
  ON dismissed_jobs(job_id);
CREATE INDEX IF NOT EXISTS idx_user_job_scores_job_id
  ON user_job_scores(job_id);
CREATE INDEX IF NOT EXISTS idx_user_job_matches_job_id
  ON user_job_matches(job_id);
CREATE INDEX IF NOT EXISTS idx_content_reports_job_id
  ON content_reports(job_id) WHERE job_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_notification_candidates_job_id
  ON notification_candidates(job_id);
CREATE INDEX IF NOT EXISTS idx_scorer_audits_job_id
  ON scorer_audits(job_id);
CREATE INDEX IF NOT EXISTS idx_viewed_jobs_job_id
  ON viewed_jobs(job_id);
