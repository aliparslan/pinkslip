-- A required doctorate is a hard disqualifier for pinkslip's audience. In a
-- production sample, 23 of 82 admitted "unknown experience" postings mentioned
-- a PhD, making it the largest single contaminant in the early-career feed.
--
-- NULL means "not yet classified" and is treated as not-required until the
-- classifier version bump backfills the column.
ALTER TABLE job_features ADD COLUMN requires_advanced_degree INTEGER;
