-- Extract once per listing and reuse across users, feed warmups and alerts.
ALTER TABLE job_features ADD COLUMN qualification_requirements_json TEXT;
-- Rebuild even profiles that previously had zero matches.
DELETE FROM user_job_matches;
UPDATE user_search_profiles SET match_cursor_seen_at = NULL;
