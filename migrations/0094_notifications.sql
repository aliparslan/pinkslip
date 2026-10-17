-- The notifications foundation (docs/backend-inventory-2026-10-16.md, step 2):
-- the phone's time zone, settings per kind, and one log of every
-- notification that also schedules the timed ones.

-- From the phone (Intl's zone name). Null until an app sends it; reminders
-- and the daily alert then use US Eastern.
ALTER TABLE users ADD COLUMN time_zone TEXT;

-- One row per person and kind, replacing the two copies of the job-alert
-- switch (user_notification_settings.enabled and
-- user_search_profiles.notifications_enabled, still written for older app
-- builds). No row means the kind's default (worker/notification-kinds.ts).
CREATE TABLE notification_settings (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
  -- new_jobs only: as they post, or once a day.
  mode TEXT CHECK (mode IS NULL OR mode IN ('post', 'daily')),
  -- new_jobs once a day: local "HH:MM".
  daily_time TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, kind)
);

INSERT INTO notification_settings (user_id, kind, enabled, mode, daily_time, updated_at)
SELECT
  u.id,
  'new_jobs',
  COALESCE(uns.enabled, usp.notifications_enabled, 0),
  'post',
  NULL,
  COALESCE(uns.updated_at, usp.updated_at, datetime('now'))
FROM users u
LEFT JOIN user_notification_settings uns ON uns.user_id = u.id
LEFT JOIN user_search_profiles usp ON usp.user_id = u.id
WHERE uns.user_id IS NOT NULL OR usp.user_id IS NOT NULL;

-- Every notification sent to a person, one row per notification (not per
-- device). Rows start 'scheduled' for timed sends; the every-minute tick
-- delivers what's due. New-job alerts, which keep their own matcher, are
-- written here as they go out, so sent and opened per kind is complete.
CREATE TABLE notification_log (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  -- The same person and key never get two notifications
  -- ("saved_job_closed:<job id>", "new_jobs_daily:2026-10-16").
  dedupe_key TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  url TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  -- Passive kinds share a cap of three pushes a day; time-sensitive ones
  -- (an interview, an offer, a reply) don't count.
  passive INTEGER NOT NULL DEFAULT 1 CHECK (passive IN (0, 1)),
  status TEXT NOT NULL CHECK (status IN ('scheduled', 'sending', 'sent', 'failed', 'skipped')),
  scheduled_for TEXT NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  -- Devices that accepted it.
  devices INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  created_at TEXT NOT NULL,
  sent_at TEXT,
  opened_at TEXT,
  UNIQUE (user_id, dedupe_key)
);

CREATE INDEX idx_notification_log_due ON notification_log (scheduled_for) WHERE status = 'scheduled';
CREATE INDEX idx_notification_log_user_sent ON notification_log (user_id, sent_at) WHERE status = 'sent';
CREATE INDEX idx_notification_log_kind_sent ON notification_log (kind, sent_at);
