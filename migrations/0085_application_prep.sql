-- Each job's application form as its ATS publishes it, normalized. Shared by
-- every user who prepares that job, refreshed after 12 hours.
CREATE TABLE application_forms (
  job_id TEXT PRIMARY KEY REFERENCES jobs(id) ON DELETE CASCADE,
  ats TEXT NOT NULL,
  form_json TEXT NOT NULL,
  version INTEGER NOT NULL,
  fetched_at TEXT NOT NULL
);

-- A user's answers bank. answer_key is a standard key ("sponsorship") or
-- "q:<question text>", so an answer given once fills every form that asks.
CREATE TABLE application_answers (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  answer_key TEXT NOT NULL,
  label TEXT NOT NULL,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, answer_key)
);
