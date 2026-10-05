-- New-job matching used to run eagerly for every search profile, including
-- guest and anonymous profiles that can never receive a push. Eager matching
-- now covers only profiles that can be notified; everyone else catches up when
-- they open their feed.
--
-- match_head_seen_at is the newest jobs.first_seen_at already evaluated for a
-- profile, so the feed catch-up only looks at jobs discovered after it. (The
-- existing match_cursor_seen_at walks the other way, back through older jobs.)
-- Until this release every profile was matched eagerly on every new job, so
-- existing profiles start caught up as of now. NULL means the profile has never
-- been matched; its first feed load sets the watermark.
ALTER TABLE user_search_profiles ADD COLUMN match_head_seen_at TEXT;

UPDATE user_search_profiles
SET match_head_seen_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now');
