-- Feed experience filters use the complete path available to this user.
ALTER TABLE user_job_matches ADD COLUMN required_years INTEGER;
DELETE FROM user_job_matches;
UPDATE user_search_profiles SET match_cursor_seen_at = NULL;
