-- Register Meta disabled so its live sitemap and JobPosting catalog can be
-- audited and backfilled without creating historical push notifications.
-- Enable only after the production backfill passes the current scope rules.
INSERT OR IGNORE INTO companies (
  id, name, ats_type, source_type, ats_slug, website, enabled, poll_tier
) VALUES (
  lower(hex(randomblob(16))),
  'Meta',
  'custom',
  'meta',
  'meta',
  'metacareers.com',
  0,
  1
);
