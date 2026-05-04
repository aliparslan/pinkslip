CREATE TABLE IF NOT EXISTS corpus_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  content_md TEXT NOT NULL,
  label TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO corpus_versions (content_md, label)
SELECT
  '# Core profile

## Target roles
- Software engineer roles with strong product or infrastructure ownership
- Early-career to mid-level roles where breadth, speed, and curiosity matter

## Top skills
- TypeScript, JavaScript, React, Svelte
- Node.js, backend APIs, data plumbing
- Product-minded frontend work and end-to-end shipping

## Experience bank
- Add 15 to 25 concrete bullets here
- Include projects, impact, ownership, metrics, and technologies
- Keep the raw details here even if they would not all fit on one resume page

## Narrative notes
- What kinds of teams energize you
- What kinds of problems you want to work on
- What you are strongest at today
',
  'starter corpus'
WHERE NOT EXISTS (SELECT 1 FROM corpus_versions);

CREATE TABLE IF NOT EXISTS tailorings (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  corpus_version_id INTEGER NOT NULL REFERENCES corpus_versions(id) ON DELETE CASCADE,
  resume_md TEXT,
  cover_letter_md TEXT,
  qa_json TEXT,
  input_tokens INTEGER,
  output_tokens INTEGER,
  model TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  user_edited_resume_md TEXT,
  user_edited_cover_md TEXT,
  user_edited_qa_json TEXT
);

CREATE INDEX IF NOT EXISTS idx_tailorings_job_created
  ON tailorings(job_id, created_at DESC);

CREATE TABLE IF NOT EXISTS fetch_runs (
  id TEXT PRIMARY KEY,
  scope TEXT NOT NULL DEFAULT 'cron',
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'ok', 'error')),
  companies_attempted INTEGER NOT NULL DEFAULT 0,
  companies_succeeded INTEGER NOT NULL DEFAULT 0,
  companies_failed INTEGER NOT NULL DEFAULT 0,
  new_jobs_found INTEGER NOT NULL DEFAULT 0,
  notifications_sent INTEGER NOT NULL DEFAULT 0,
  errors_json TEXT,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  finished_at TEXT,
  duration_ms INTEGER
);

CREATE INDEX IF NOT EXISTS idx_fetch_runs_started
  ON fetch_runs(started_at DESC);
