-- Errors the Worker and the apps run into, one row per kind of error and
-- where it happened (docs/backend-inventory-2026-10-16.md, Decisions: Admin
-- #1). No outside service: the Worker's onError, failed crons, queues and
-- inbound mail, and the apps' JavaScript errors all land here.
--
-- A new row is a new kind. The every-minute tick pushes admins about rows
-- with no alerted_at and stamps them, so each kind is announced once.
CREATE TABLE errors (
  id TEXT PRIMARY KEY,
  -- Where it ran: the API, a cron, a queue consumer, inbound mail, or an app.
  source TEXT NOT NULL CHECK (source IN ('api', 'cron', 'queue', 'email', 'ios', 'web')),
  -- The error's name and message with ids, numbers, emails and links taken
  -- out, so the same fault groups into one row.
  kind TEXT NOT NULL,
  -- "GET /api/v2/jobs/:id", a cron or queue name, or the app screen.
  route TEXT NOT NULL,
  -- The latest occurrence, for reading in Admin.
  message TEXT NOT NULL,
  stack TEXT,
  count INTEGER NOT NULL DEFAULT 1,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  -- The Cloudflare ray of the latest API error, to find it in Worker logs.
  last_request_id TEXT,
  -- The app build that sent the latest report.
  last_build TEXT,
  alerted_at TEXT,
  UNIQUE (source, kind, route)
);

CREATE INDEX idx_errors_unalerted ON errors (first_seen_at) WHERE alerted_at IS NULL;
CREATE INDEX idx_errors_last_seen ON errors (last_seen_at DESC);
