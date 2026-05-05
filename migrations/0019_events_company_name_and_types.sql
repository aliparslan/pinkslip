-- Add company_name to events for custom (non-tracked) companies
-- and recreate table to relax event_type CHECK constraint

CREATE TABLE IF NOT EXISTS events_new (
  id TEXT PRIMARY KEY,
  company_id TEXT REFERENCES companies(id) ON DELETE CASCADE,
  company_name TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  event_type TEXT NOT NULL DEFAULT 'other',
  event_date TEXT NOT NULL,
  location TEXT NOT NULL DEFAULT '',
  url TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO events_new (id, company_id, company_name, title, description, event_type, event_date, location, url, created_at)
  SELECT id, company_id, '', title, description, event_type, event_date, location, url, created_at FROM events;

DROP TABLE events;
ALTER TABLE events_new RENAME TO events;

CREATE INDEX idx_events_date ON events(event_date);
CREATE INDEX idx_events_company ON events(company_id);
