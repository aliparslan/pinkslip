-- Companies the owner approved that needed the Oracle reader, or whose boards had
-- moved. Each was read through Pinkslip's own adapter on 2026-11-08. Disabled so
-- the backfill can't reach anyone as new-job alerts; 0120 turns them on.

CREATE TABLE add_0119_companies (
  name TEXT NOT NULL,
  ats_type TEXT NOT NULL,
  source_type TEXT NOT NULL,
  ats_slug TEXT NOT NULL,
  website TEXT NOT NULL
);

INSERT INTO add_0119_companies VALUES
  ('Aircall', 'greenhouse', 'greenhouse', 'aircallioinc', 'https://aircall.io'),
  ('Akamai Technologies', 'custom', 'oracle', 'fa-extu-saasfaprod1.fa.ocs.oraclecloud.com/CX_1', 'https://akamai.com'),
  ('American Express', 'custom', 'oracle', 'egug.fa.us2.oraclecloud.com/CX_1', 'https://americanexpress.com'),
  ('AQR Capital Management', 'greenhouse', 'greenhouse', 'aqr', 'https://aqr.com'),
  ('Beacon Software', 'ashby', 'ashby', 'beaconholdings', 'https://beaconsoftware.com'),
  ('BNY', 'custom', 'oracle', 'eofe.fa.us2.oraclecloud.com/BNY-Careers', 'https://bny.com'),
  ('Fortinet', 'custom', 'oracle', 'edel.fa.us2.oraclecloud.com/CX_2001', 'https://fortinet.com'),
  ('Honeywell', 'custom', 'oracle', 'ibqbjb.fa.ocs.oraclecloud.com/Honeywell', 'https://honeywell.com'),
  ('JPMorgan Chase', 'custom', 'oracle', 'jpmc.fa.oraclecloud.com/CX_1001', 'https://jpmorganchase.com'),
  ('LiveRamp', 'ashby', 'ashby', 'liveramp-inc', 'https://liveramp.com'),
  ('Oracle', 'custom', 'oracle', 'eeho.fa.us2.oraclecloud.com/jobsearch', 'https://oracle.com'),
  ('Texas Instruments', 'custom', 'oracle', 'edbz.fa.us2.oraclecloud.com/CX', 'https://ti.com'),
  ('Visa', 'custom', 'workday', 'https://visa.wd5.myworkdayjobs.com/Visa?country=US', 'https://visa.com'),
  ('Within', 'ashby', 'ashby', 'within.ai', 'https://within.ai');

INSERT OR IGNORE INTO companies (id, name, ats_type, source_type, ats_slug, website, enabled, poll_tier)
SELECT lower(hex(randomblob(16))), a.name, a.ats_type, a.source_type, a.ats_slug, a.website, 0, 2
FROM add_0119_companies a
WHERE NOT EXISTS (
  SELECT 1 FROM companies c
  WHERE LOWER(TRIM(c.name)) = LOWER(TRIM(a.name))
     OR (COALESCE(c.source_type, c.ats_type) = a.source_type AND LOWER(TRIM(c.ats_slug)) = LOWER(TRIM(a.ats_slug)))
);

DROP TABLE add_0119_companies;
