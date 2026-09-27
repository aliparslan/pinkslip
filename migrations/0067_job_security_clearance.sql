-- A required security clearance is a hard exclusion for the current Pinkslip
-- audience. NULL means "not yet classified" so the classifier-version bump can
-- distinguish existing rows that still need the new deterministic feature.
ALTER TABLE job_features ADD COLUMN requires_security_clearance INTEGER;
