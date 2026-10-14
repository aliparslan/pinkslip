-- Email tracking by forwarding (docs/email-tracking.md). Each signed-in user
-- gets inbox+<tag>@pinkslip.work; mail forwarded there is read in memory and
-- only what it says about an application is kept. No email body is stored.

CREATE TABLE email_inboxes (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  -- The +tag. Rotating it replaces the address.
  tag TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  -- Gmail sends a confirmation to a new forwarding address. Its code and link
  -- are kept until forwarding works, so the app can show them.
  forwarding_confirmed_at TEXT,
  forwarding_code TEXT,
  forwarding_link TEXT,
  last_email_at TEXT
);

-- One row per email that said something about an application.
CREATE TABLE inbound_emails (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- SHA-256 of the Message-ID (or of sender, subject and date), so the same
  -- email forwarded twice counts once.
  message_hash TEXT NOT NULL,
  received_at TEXT NOT NULL,
  -- The original sender, after unwrapping a manual forward.
  sender_name TEXT NOT NULL DEFAULT '',
  sender_address TEXT NOT NULL DEFAULT '',
  subject TEXT NOT NULL DEFAULT '',
  sent_at TEXT,
  detected_stage TEXT NOT NULL CHECK (detected_stage IN (
    'applied', 'assessment', 'interview', 'offer', 'rejected'
  )),
  company_id TEXT REFERENCES companies(id) ON DELETE SET NULL,
  -- applied: moved an application forward; created: started one;
  -- unchanged: matched, nothing to move; needs_choice: waiting on the user;
  -- assigned: the user picked one; dismissed: "not one of these";
  -- undone: "not right", the step was removed.
  status TEXT NOT NULL CHECK (status IN (
    'applied', 'created', 'unchanged', 'needs_choice', 'assigned', 'dismissed', 'undone'
  )),
  application_id TEXT REFERENCES applications(id) ON DELETE SET NULL,
  -- JSON array of application ids while status is needs_choice.
  candidate_application_ids TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  UNIQUE (user_id, message_hash)
);

CREATE INDEX idx_inbound_emails_user_status
  ON inbound_emails(user_id, status, received_at);
CREATE INDEX idx_inbound_emails_application
  ON inbound_emails(application_id) WHERE application_id IS NOT NULL;

-- The email behind an email-detected step, for "Not right?".
ALTER TABLE application_events ADD COLUMN inbound_email_id TEXT
  REFERENCES inbound_emails(id) ON DELETE SET NULL;
