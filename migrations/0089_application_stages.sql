-- Applications with stages. Saved is now the first stage of an application
-- instead of a separate list, so a tracked job has exactly one record and
-- appears in one place: Saved → Applied → Assessment → Interview → Offer,
-- ending in Rejected, Withdrawn or Ghosted. Each change is kept in
-- application_events, the application's timeline.
--
-- The old CHECK only allowed the early pipeline's stages, so the table is
-- rebuilt. No table references applications, so dropping it is safe.

CREATE TABLE applications_staged (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  job_id TEXT REFERENCES jobs(id) ON DELETE SET NULL,
  -- Snapshots, so the history survives the job leaving the catalog.
  company_name TEXT NOT NULL,
  title TEXT NOT NULL,
  url TEXT NOT NULL DEFAULT '',
  stage TEXT NOT NULL CHECK (stage IN (
    'saved', 'applied', 'assessment', 'interview', 'offer',
    'rejected', 'withdrawn', 'ghosted'
  )),
  notes TEXT NOT NULL DEFAULT '',
  applied_at TEXT,
  stage_changed_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Existing applications. Both apps only ever wrote 'Applied'; the other
-- values come from the early pipeline. Its unused `next` text moves to notes.
INSERT INTO applications_staged (
  id, user_id, job_id, company_name, title, url, stage, notes,
  applied_at, stage_changed_at, created_at, updated_at
)
SELECT
  id, user_id, job_id, company_name, title, url,
  CASE stage
    WHEN 'Screen' THEN 'assessment'
    WHEN 'Interview' THEN 'interview'
    WHEN 'Offer' THEN 'offer'
    WHEN 'Rejected' THEN 'rejected'
    WHEN 'Ghosted' THEN 'ghosted'
    ELSE 'applied'
  END,
  next,
  created_at, updated_at, created_at, updated_at
FROM applications;

-- Saved jobs not yet applied to become Saved applications.
INSERT INTO applications_staged (
  id, user_id, job_id, company_name, title, url, stage, notes,
  applied_at, stage_changed_at, created_at, updated_at
)
SELECT
  lower(hex(randomblob(16))), s.user_id, s.job_id, c.name, j.title, COALESCE(j.url, ''),
  'saved', '', NULL, s.saved_at, s.saved_at, s.saved_at
FROM saved_jobs s
JOIN jobs j ON j.id = s.job_id
JOIN companies c ON c.id = j.company_id
WHERE NOT EXISTS (
  SELECT 1 FROM applications a
  WHERE a.user_id = s.user_id AND a.job_id = s.job_id
);

DROP TABLE applications;
ALTER TABLE applications_staged RENAME TO applications;

CREATE UNIQUE INDEX idx_applications_user_job
  ON applications(user_id, job_id) WHERE job_id IS NOT NULL;
CREATE INDEX idx_applications_user_stage ON applications(user_id, stage);
CREATE INDEX idx_applications_job_id
  ON applications(job_id) WHERE job_id IS NOT NULL;

CREATE TABLE application_events (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  -- The stage the application entered.
  stage TEXT NOT NULL CHECK (stage IN (
    'saved', 'applied', 'assessment', 'interview', 'offer',
    'rejected', 'withdrawn', 'ghosted'
  )),
  -- Who recorded it: 'user' today; email detection and automation later.
  source TEXT NOT NULL DEFAULT 'user',
  occurred_at TEXT NOT NULL
);

CREATE INDEX idx_application_events_application
  ON application_events(application_id, occurred_at);

-- Rebuild what the timeline can know: when each job was saved, when it was
-- applied to, and when an early-pipeline application last changed stage.
INSERT INTO application_events (id, application_id, stage, source, occurred_at)
SELECT lower(hex(randomblob(16))), a.id, 'saved', 'user', s.saved_at
FROM applications a
JOIN saved_jobs s ON s.user_id = a.user_id AND s.job_id = a.job_id
WHERE a.stage = 'saved' OR julianday(s.saved_at) <= julianday(a.created_at);

INSERT INTO application_events (id, application_id, stage, source, occurred_at)
SELECT lower(hex(randomblob(16))), id, 'applied', 'user', applied_at
FROM applications
WHERE stage != 'saved';

INSERT INTO application_events (id, application_id, stage, source, occurred_at)
SELECT lower(hex(randomblob(16))), id, stage, 'user', stage_changed_at
FROM applications
WHERE stage NOT IN ('saved', 'applied');

DROP TABLE saved_jobs;
