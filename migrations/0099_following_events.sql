-- Step 7, following and events (docs/backend-inventory-2026-10-16.md,
-- Decisions: Following and events). Additive: three new tables.

-- Companies a person follows. Following only widens what reaches them: a
-- followed company's jobs at their level match even outside their roles and
-- places (worker/user-job-matches.ts), and its new jobs ride with new-job
-- alerts marked "Following" (N20). Never followed automatically.
CREATE TABLE company_follows (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  followed_at TEXT NOT NULL,
  PRIMARY KEY (user_id, company_id)
);
CREATE INDEX idx_company_follows_company ON company_follows(company_id, user_id);

-- A company's info sessions and fairs, added in Admin from a pasted link
-- (no scraping). Times are instants; each person sees them in their own
-- time zone, and an event leaves the company's page the day after.
-- (The older `events` table holds a person's own interviews and calls.)
CREATE TABLE company_events (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  starts_at TEXT NOT NULL,
  ends_at TEXT,
  -- "Online", or where it's held.
  location TEXT NOT NULL DEFAULT '',
  online INTEGER NOT NULL DEFAULT 0,
  -- Their page; Sign up opens it.
  url TEXT NOT NULL,
  signup_closes_at TEXT,
  -- Who it's for ("New grads", "Everyone").
  audience TEXT NOT NULL DEFAULT '',
  host TEXT NOT NULL DEFAULT '',
  about TEXT NOT NULL DEFAULT '',
  -- A few short lines: what you'll get from it.
  points_json TEXT NOT NULL DEFAULT '[]',
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_company_events_company ON company_events(company_id, starts_at);
CREATE INDEX idx_company_events_starts ON company_events(starts_at);

-- Remind me (N19): a push the day before.
CREATE TABLE event_reminders (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_id TEXT NOT NULL REFERENCES company_events(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, event_id)
);
CREATE INDEX idx_event_reminders_event ON event_reminders(event_id);
