-- Debounce job closing. Previously any nonempty ATS poll was treated as the full
-- authoritative list, so a partial/failed upstream page closed every omitted job
-- (removing valid jobs from every feed). Track consecutive misses so a job is
-- only closed after it's been absent across multiple polls.
ALTER TABLE jobs ADD COLUMN missed_polls INTEGER NOT NULL DEFAULT 0;
