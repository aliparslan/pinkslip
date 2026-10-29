-- Asking as strong matches post (owner, 2026-10-29; Decisions: Auto-apply #2,
-- revisited; worker/apply/asks.ts). There's no morning list: a strong match
-- either asks with one push (Ask me) or is sent with no ask (Apply for me,
-- Pro).

-- How auto-apply acts on a strong match. No row means Ask me, not paused.
CREATE TABLE IF NOT EXISTS auto_apply_settings (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  mode TEXT NOT NULL DEFAULT 'ask' CHECK (mode IN ('ask', 'auto', 'off')),
  -- Nothing is asked or sent before this; far in the future for "until I
  -- turn it back on".
  paused_until TEXT,
  updated_at TEXT NOT NULL
);

-- Every strong match acted on, once per person and job: asked (the push is
-- scheduled for notify_at, held to the morning overnight), applied or
-- dismissed from the push, or sent with no ask.
CREATE TABLE IF NOT EXISTS apply_asks (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('asked', 'applied', 'dismissed', 'sent')),
  send_id TEXT,
  notify_at TEXT,
  created_at TEXT NOT NULL,
  decided_at TEXT,
  UNIQUE (user_id, job_id)
);

CREATE INDEX IF NOT EXISTS idx_apply_asks_user ON apply_asks(user_id, created_at);
