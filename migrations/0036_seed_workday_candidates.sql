CREATE TABLE seed_0036_workday_companies (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  ats_slug TEXT NOT NULL,
  website TEXT NOT NULL
);

INSERT INTO seed_0036_workday_companies (id, name, ats_slug, website) VALUES
  (
    'workday-netflix',
    'Netflix',
    'https://netflix.wd108.myworkdayjobs.com/en-US/Netflix?country=US',
    'https://netflix.com'
  ),
  (
    'workday-nvidia',
    'NVIDIA',
    'https://nvidia.wd5.myworkdayjobs.com/en-US/NVIDIAExternalCareerSite?country=US',
    'https://nvidia.com'
  ),
  (
    'workday-adobe',
    'Adobe',
    'https://adobe.wd5.myworkdayjobs.com/en-US/external_experienced?country=US',
    'https://adobe.com'
  ),
  (
    'workday-snap',
    'Snap',
    'https://snapchat.wd1.myworkdayjobs.com/en-US/sourced?country=US',
    'https://snap.com'
  ),
  (
    'workday-autodesk',
    'Autodesk',
    'https://autodesk.wd1.myworkdayjobs.com/en-US/Ext?country=US',
    'https://autodesk.com'
  );

UPDATE companies
SET ats_type = 'custom',
    source_type = 'workday',
    ats_slug = (
      SELECT candidate.ats_slug
      FROM seed_0036_workday_companies candidate
      WHERE lower(candidate.name) = lower(companies.name)
    ),
    website = (
      SELECT candidate.website
      FROM seed_0036_workday_companies candidate
      WHERE lower(candidate.name) = lower(companies.name)
    ),
    enabled = 0,
    last_poll_status = NULL,
    last_poll_error = 'Pending Workday rollout verification'
WHERE EXISTS (
  SELECT 1
  FROM seed_0036_workday_companies candidate
  WHERE lower(candidate.name) = lower(companies.name)
);

INSERT INTO companies (
  id,
  name,
  ats_type,
  source_type,
  ats_slug,
  website,
  enabled,
  added_at,
  last_poll_error
)
SELECT
  candidate.id,
  candidate.name,
  'custom',
  'workday',
  candidate.ats_slug,
  candidate.website,
  0,
  datetime('now'),
  'Pending Workday rollout verification'
FROM seed_0036_workday_companies candidate
WHERE NOT EXISTS (
  SELECT 1
  FROM companies
  WHERE lower(companies.name) = lower(candidate.name)
);

DROP TABLE seed_0036_workday_companies;
