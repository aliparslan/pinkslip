-- Register Google disabled so its current catalog can be verified and
-- backfilled without notifying users. Enable only after the deployed adapter's
-- first bounded discovery poll succeeds.
INSERT OR IGNORE INTO companies (
  id, name, ats_type, source_type, ats_slug, website, enabled, poll_tier
) VALUES (
  lower(hex(randomblob(16))),
  'Google',
  'custom',
  'google',
  'google',
  'google.com',
  0,
  1
);
