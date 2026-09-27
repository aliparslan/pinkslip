-- Internship admission changes which reference-only Meta and Uber postings are
-- worth persisting. References inspected under the old policy are rehydrated
-- once and then checkpointed at the current inspection policy version.
ALTER TABLE source_job_references
  ADD COLUMN inspection_policy_version INTEGER NOT NULL DEFAULT 1;
