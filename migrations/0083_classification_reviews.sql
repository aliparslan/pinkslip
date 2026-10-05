-- An admin's call on a job where the rules and Jev disagree. These labels are
-- the accuracy check before Jev is trusted with real decisions, so they are
-- kept apart from job_features and never change what users are shown.
CREATE TABLE classification_reviews (
  cache_key TEXT PRIMARY KEY REFERENCES job_classification_shadow(cache_key) ON DELETE CASCADE,
  verdict TEXT NOT NULL CHECK(verdict IN ('rules', 'jev', 'neither', 'unclear')),
  note TEXT,
  reviewed_by TEXT NOT NULL,
  reviewed_at TEXT NOT NULL
);
