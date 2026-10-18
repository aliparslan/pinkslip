-- The Activity stream (docs/backend-inventory-2026-10-16.md, step 3;
-- Decisions: Activity stream and Today): one table of what happened across a
-- person's applications, emails, outreach and alerts. It feeds Today's What
-- changed, the notifications that start from it (N3, N4, N9, N10), and later
-- digests and timelines. Needs you and Coming up are read from the current
-- state of applications, emails and threads, so they clear themselves.

CREATE TABLE activity (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN (
    'stage_moved', 'email_needs_choice', 'date_set', 'reminder_due',
    'follow_up_due', 'replied', 'saved_job_closed', 'new_jobs_sent'
  )),
  -- Who made it happen.
  source TEXT NOT NULL DEFAULT 'system' CHECK (source IN ('user', 'email', 'auto_apply', 'system')),
  application_id TEXT REFERENCES applications(id) ON DELETE CASCADE,
  -- A stage move is its timeline entry's twin: undoing an email's step or
  -- deleting the application removes both.
  event_id TEXT REFERENCES application_events(id) ON DELETE CASCADE,
  job_id TEXT REFERENCES jobs(id) ON DELETE SET NULL,
  inbound_email_id TEXT REFERENCES inbound_emails(id) ON DELETE CASCADE,
  thread_id TEXT REFERENCES outreach_threads(id) ON DELETE CASCADE,
  -- The stage entered (stage_moved).
  stage TEXT,
  -- Small facts for the kind: {"count": 5}, {"date": "2026-10-20"}.
  detail_json TEXT NOT NULL DEFAULT '{}',
  occurred_at TEXT NOT NULL,
  -- Things that happen once per person: "saved_job_closed:<job>",
  -- "follow_up:<message>", "email:<id>".
  dedupe_key TEXT,
  created_at TEXT NOT NULL
);

CREATE UNIQUE INDEX idx_activity_dedupe ON activity (user_id, dedupe_key) WHERE dedupe_key IS NOT NULL;
CREATE INDEX idx_activity_user_time ON activity (user_id, occurred_at DESC);
CREATE INDEX idx_activity_application ON activity (application_id);
CREATE INDEX idx_activity_email ON activity (inbound_email_id);

-- When the person last opened Today, on any device (Decisions #4).
ALTER TABLE users ADD COLUMN today_seen_at TEXT;

-- Backfill, so Today isn't empty on day one (Decisions #6).

-- Every timeline entry is a stage move.
INSERT INTO activity (
  id, user_id, kind, source, application_id, event_id, job_id, inbound_email_id,
  stage, occurred_at, created_at
)
SELECT
  lower(hex(randomblob(16))), a.user_id, 'stage_moved',
  CASE WHEN e.source IN ('user', 'email', 'auto_apply') THEN e.source ELSE 'user' END,
  a.id, e.id, a.job_id, e.inbound_email_id, e.stage, e.occurred_at, datetime('now')
FROM application_events e
JOIN applications a ON a.id = e.application_id
WHERE a.user_id IS NOT NULL;

-- Emails still waiting for "Which application?".
INSERT INTO activity (
  id, user_id, kind, source, inbound_email_id, occurred_at, dedupe_key, created_at
)
SELECT lower(hex(randomblob(16))), user_id, 'email_needs_choice', 'email', id, received_at,
       'email:' || id, datetime('now')
FROM inbound_emails
WHERE status = 'needs_choice';

-- Saved jobs the company closed (missed polls, not Pinkslip's own clean-up).
INSERT OR IGNORE INTO activity (
  id, user_id, kind, source, application_id, job_id, occurred_at, dedupe_key, created_at
)
SELECT lower(hex(randomblob(16))), a.user_id, 'saved_job_closed', 'system', a.id, j.id,
       j.closed_at, 'saved_job_closed:' || j.id, datetime('now')
FROM applications a
JOIN jobs j ON j.id = a.job_id
WHERE a.stage = 'saved' AND a.user_id IS NOT NULL
  AND j.closed_at IS NOT NULL AND j.missed_polls >= 2;

-- Follow-ups that already came due.
INSERT OR IGNORE INTO activity (
  id, user_id, kind, source, job_id, thread_id, occurred_at, dedupe_key, created_at
)
SELECT lower(hex(randomblob(16))), ot.user_id, 'follow_up_due', 'system', ot.job_id, ot.id,
       om.due_at, 'follow_up:' || om.id, datetime('now')
FROM outreach_messages om
JOIN outreach_threads ot ON ot.id = om.thread_id
WHERE om.reminded_at IS NOT NULL AND om.due_at IS NOT NULL;
