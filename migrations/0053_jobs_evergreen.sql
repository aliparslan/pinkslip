-- Evergreen requisitions — "General Interest", "Talent Community",
-- perpetually-open pipeline roles — never leave a company's board, so they are
-- never absent from a snapshot and the missed_polls path never closes them.
-- They then age past the freshness window and become invisible but immortal:
-- 1,124 of 2,430 open rows in production, 1,057 from perfectly healthy sources.
--
-- They are worth keeping rather than closing — a standing pipeline req is still
-- a real way in — but they must not masquerade as fresh postings in the feed.
-- Flagging them lets the feed hide them by default and surface them on demand,
-- which is what the previously-dead "Undated" filter slot now does.
ALTER TABLE jobs ADD COLUMN evergreen INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_jobs_evergreen ON jobs(evergreen, closed_at);
