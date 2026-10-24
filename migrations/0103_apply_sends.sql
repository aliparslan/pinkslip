-- Step 10, auto-apply (docs/auto-apply-phase1-2026-10-24.md): each time
-- Pinkslip's server browser applies for someone, and what it sent
-- (Decisions: Auto-apply #4, #5). Admin-only until the owner's own test
-- applications go through (#6).

CREATE TABLE IF NOT EXISTS apply_sends (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  job_id TEXT NOT NULL,
  ats TEXT NOT NULL CHECK (ats IN ('greenhouse', 'ashby')),
  url TEXT NOT NULL,
  -- A dry run does everything except press Submit.
  dry_run INTEGER NOT NULL DEFAULT 0,
  -- queued → running → submitting → submitted. code_needed waits for the
  -- code Greenhouse emails; unconfirmed means Submit was pressed but no
  -- confirmation showed; ready is a dry run that would have sent.
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN (
    'queued', 'running', 'submitting', 'code_needed', 'submitted', 'unconfirmed',
    'ready', 'needs_you', 'blocked', 'gone', 'failed'
  )),
  -- Why it stopped, in a sentence.
  detail TEXT,
  -- Required questions left empty: [{ "label", "kind" }].
  needs_json TEXT,
  -- Everything on the form when Submit was pressed (or would have been):
  -- [{ "label", "value", "by" }]: Pinkslip, Jev's inference, the site's own
  -- read of the resume, or already on the page.
  sent_json TEXT,
  -- RESUME_BUCKET keys: the filled form, then the confirmation page.
  form_shot_key TEXT,
  proof_shot_key TEXT,
  confirmation_text TEXT,
  confirmation_url TEXT,
  -- Browser Run's session, kept while the emailed code is on its way.
  browser_session TEXT,
  -- The allowance it reserved (usage_ledger), given back if nothing went out.
  ledger_id TEXT,
  created_at TEXT NOT NULL,
  started_at TEXT,
  finished_at TEXT,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_apply_sends_user ON apply_sends(user_id, created_at);

-- Never the same job twice: one real send per job that went out, or may have.
CREATE UNIQUE INDEX IF NOT EXISTS idx_apply_sends_once ON apply_sends(user_id, job_id)
  WHERE dry_run = 0
    AND status IN ('queued', 'running', 'submitting', 'code_needed', 'submitted', 'unconfirmed');
