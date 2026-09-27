-- Replace Uber's retired Greenhouse board in place so the company keeps its
-- stable ID and any future interaction history. Leave it disabled until the
-- official Uber catalog has been backfilled without historical notifications.
UPDATE companies
SET ats_type = 'custom',
    source_type = 'uber',
    ats_slug = 'uber',
    website = 'uber.com',
    enabled = 0,
    poll_tier = 1,
    last_poll_status = NULL,
    last_poll_error = NULL,
    last_polled_at = NULL,
    poll_failure_count = 0,
    quarantined_at = NULL
WHERE LOWER(TRIM(name)) = 'uber';

INSERT OR IGNORE INTO companies (
  id, name, ats_type, source_type, ats_slug, website, enabled, poll_tier
) VALUES (
  lower(hex(randomblob(16))),
  'Uber',
  'custom',
  'uber',
  'uber',
  'uber.com',
  0,
  1
);

-- Tesla's public catalog is much larger and is therefore part of the rotating
-- tier-2 schedule. As with Uber, production verification/backfill happens while
-- disabled so only jobs discovered after enablement can create notifications.
UPDATE companies
SET ats_type = 'custom',
    source_type = 'tesla',
    ats_slug = 'tesla',
    website = 'tesla.com',
    enabled = 0,
    poll_tier = 2,
    last_poll_status = NULL,
    last_poll_error = NULL,
    last_polled_at = NULL,
    poll_failure_count = 0,
    quarantined_at = NULL
WHERE LOWER(TRIM(name)) = 'tesla';

INSERT OR IGNORE INTO companies (
  id, name, ats_type, source_type, ats_slug, website, enabled, poll_tier
) VALUES (
  lower(hex(randomblob(16))),
  'Tesla',
  'custom',
  'tesla',
  'tesla',
  'tesla.com',
  0,
  2
);
