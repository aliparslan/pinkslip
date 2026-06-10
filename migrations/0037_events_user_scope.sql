-- Scope events to the user who created them. Previously the `events` table had
-- no user_id, so every user could list, and DELETE, every other user's
-- interviews / recruiter calls / deadlines. All event queries now filter on
-- user_id. Pre-existing rows keep user_id = NULL (preserved, but no longer shown
-- to anyone) rather than being attributed to an arbitrary account.
ALTER TABLE events ADD COLUMN user_id TEXT REFERENCES users(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_events_user_date ON events(user_id, event_date);
