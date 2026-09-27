-- Register the selected company sources in a disabled state. Production
-- backfill and verification run against each source before the normal polling
-- schedule is allowed to include it.
INSERT OR IGNORE INTO companies (
  id, name, ats_type, source_type, ats_slug, website, enabled, poll_tier
) VALUES (
  lower(hex(randomblob(16))),
  'PayPal',
  'custom',
  'eightfold',
  'https://paypal.eightfold.ai/careers?domain=paypal.com',
  'paypal.com',
  0,
  2
);

-- Micron's branded Eightfold page is backed by Workday. The Workday US feed is
-- both complete and fresher than the Eightfold mirror, so use the system of
-- record and avoid introducing a second identity namespace for the same jobs.
INSERT OR IGNORE INTO companies (
  id, name, ats_type, source_type, ats_slug, website, enabled, poll_tier
) VALUES (
  lower(hex(randomblob(16))),
  'Micron',
  'custom',
  'workday',
  'https://micron.wd1.myworkdayjobs.com/en-US/External?country=US',
  'micron.com',
  0,
  2
);
