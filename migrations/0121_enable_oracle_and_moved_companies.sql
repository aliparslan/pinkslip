-- Turns on the companies 0119 and 0120 added, now that their open jobs are backfilled.

UPDATE companies
SET enabled = 1
WHERE enabled = 0
  AND poll_tier = 2
  AND name IN (
    'Aircall',
    'Akamai Technologies',
    'American Express',
    'AQR Capital Management',
    'Beacon Software',
    'BNY',
    'Fortinet',
    'Honeywell',
    'JPMorgan Chase',
    'LiveRamp',
    'Oracle',
    'Texas Instruments',
    'Unity',
    'Visa',
    'Within'
  );
