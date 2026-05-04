CREATE TABLE IF NOT EXISTS saved_jobs (
  job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  saved_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (job_id)
);

CREATE TABLE IF NOT EXISTS applications (
  id TEXT PRIMARY KEY,
  job_id TEXT REFERENCES jobs(id) ON DELETE SET NULL,
  company_name TEXT NOT NULL,
  title TEXT NOT NULL,
  stage TEXT NOT NULL DEFAULT 'Applied' CHECK (stage IN ('Applied', 'Screen', 'Interview', 'Offer', 'Rejected', 'Ghosted')),
  next TEXT NOT NULL DEFAULT '',
  url TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_applications_stage ON applications(stage);
CREATE INDEX idx_applications_updated ON applications(updated_at DESC);

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  company_id TEXT REFERENCES companies(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  event_type TEXT NOT NULL DEFAULT 'other' CHECK (event_type IN ('career_fair', 'info_session', 'workshop', 'networking', 'other')),
  event_date TEXT NOT NULL,
  location TEXT NOT NULL DEFAULT '',
  url TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_events_date ON events(event_date);
CREATE INDEX idx_events_company ON events(company_id);

-- Add saved column to jobs table for quick lookups
ALTER TABLE jobs ADD COLUMN saved INTEGER NOT NULL DEFAULT 0;
