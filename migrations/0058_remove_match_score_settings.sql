-- Score thresholds no longer have meaning once eligibility is binary.
ALTER TABLE notification_candidates DROP COLUMN score;
ALTER TABLE user_notification_settings DROP COLUMN threshold;
ALTER TABLE user_search_profiles DROP COLUMN match_threshold;
