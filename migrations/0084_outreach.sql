-- Cold outreach to recruiters. Contacts belong to the company, not the user, so
-- one lookup serves everyone and the per-recipient cap can count across users.
CREATE TABLE company_contacts (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(company_id, email)
);

-- One thread per user and recruiter: the first email plus at most two
-- follow-ups. Pinkslip drafts and schedules; the user sends from their own mail.
CREATE TABLE outreach_threads (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  job_id TEXT REFERENCES jobs(id) ON DELETE SET NULL,
  contact_id TEXT NOT NULL REFERENCES company_contacts(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK(status IN ('draft', 'active', 'replied', 'stopped', 'finished')),
  time_zone TEXT NOT NULL DEFAULT 'America/New_York',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(user_id, contact_id)
);

CREATE INDEX idx_outreach_threads_user_updated
  ON outreach_threads(user_id, updated_at DESC);
CREATE INDEX idx_outreach_threads_user_job
  ON outreach_threads(user_id, job_id);
CREATE INDEX idx_outreach_threads_contact_created
  ON outreach_threads(contact_id, created_at);

-- Step 0 is the first email; steps 1 and 2 are follow-ups. A follow-up turns
-- 'scheduled' with a due_at once the step before it is sent.
CREATE TABLE outreach_messages (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL REFERENCES outreach_threads(id) ON DELETE CASCADE,
  step INTEGER NOT NULL CHECK(step BETWEEN 0 AND 2),
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('draft', 'scheduled', 'sent', 'skipped')),
  due_at TEXT,
  reminded_at TEXT,
  sent_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(thread_id, step)
);

CREATE INDEX idx_outreach_messages_due
  ON outreach_messages(due_at)
  WHERE status = 'scheduled' AND reminded_at IS NULL;
