-- Unity's board had moved to Workday. Read through Pinkslip's own adapter on
-- 2026-11-08. Disabled so the backfill can't reach anyone as new-job alerts.

INSERT OR IGNORE INTO companies (id, name, ats_type, source_type, ats_slug, website, enabled, poll_tier)
SELECT lower(hex(randomblob(16))), 'Unity', 'custom', 'workday', 'https://unitytech.wd1.myworkdayjobs.com/Unity?country=US', 'https://unity.com', 0, 2
WHERE NOT EXISTS (
  SELECT 1 FROM companies c
  WHERE LOWER(TRIM(c.name)) = 'unity'
     OR (COALESCE(c.source_type, c.ats_type) = 'workday' AND LOWER(TRIM(c.ats_slug)) = 'https://unitytech.wd1.myworkdayjobs.com/unity?country=us')
);
