-- A tailoring is grounded against the exact resume the user reviewed. Existing
-- pre-snapshot drafts remain visible but must be restarted before generation.
ALTER TABLE tailorings ADD COLUMN profile_snapshot_json TEXT;
ALTER TABLE tailorings ADD COLUMN profile_hash TEXT;
