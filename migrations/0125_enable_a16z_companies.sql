-- Turns on the companies 0124 added, now that their open jobs are backfilled. From
-- here only jobs posted after the backfill count as new. Named one by one because
-- older sources are disabled on purpose.

UPDATE companies
SET enabled = 1
WHERE enabled = 0
  AND poll_tier = 2
  AND name IN (
    'Backflip AI',
    'Belisar',
    'Braintrust',
    'Cluely',
    'Clutch',
    'Crux',
    'Flow',
    'Lumos',
    'Material Security',
    'Pomelo Care',
    'Promise',
    'Rillet',
    'Standard Nuclear',
    'Thyme Care',
    'Town',
    'Wingspan',
    'Yuno'
  );
