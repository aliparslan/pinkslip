-- Register the first custom-company adapter wave without allowing the cron to
-- race the initial production verification. Each source is enabled only after
-- its first complete poll succeeds against the deployed adapter.
INSERT OR IGNORE INTO companies (
  id, name, ats_type, source_type, ats_slug, website, enabled, poll_tier
) VALUES (
  lower(hex(randomblob(16))),
  'Apple',
  'custom',
  'apple',
  'apple',
  'apple.com',
  0,
  2
);

INSERT OR IGNORE INTO companies (
  id, name, ats_type, source_type, ats_slug, website, enabled, poll_tier
) VALUES (
  lower(hex(randomblob(16))),
  'Bloomberg',
  'custom',
  'bloomberg',
  'bloomberg',
  'bloomberg.com',
  0,
  2
);
