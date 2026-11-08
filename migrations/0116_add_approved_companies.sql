-- Companies the owner approved on the candidate review of 2026-10-05 and that
-- were never added. Each board was read through Pinkslip's own adapter on
-- 2026-11-08 and each website or board checked against the company. See
-- docs/housekeeping-2026-11-08.md. Workday boards are large, so they poll hourly.
--
-- A source that already exists under either unique index is skipped, so this
-- is safe to run after an admin has added any of these by hand.

CREATE TABLE add_0116_companies (
  name TEXT NOT NULL,
  ats_type TEXT NOT NULL,
  source_type TEXT NOT NULL,
  ats_slug TEXT NOT NULL,
  website TEXT NOT NULL,
  poll_tier INTEGER NOT NULL
);

INSERT INTO add_0116_companies VALUES
  ('2K', 'greenhouse', 'greenhouse', '2k', 'https://2k.com', 1),
  ('AI Fund', 'lever', 'lever', 'AIFund', 'https://aifund.ai', 1),
  ('Alarm.com', 'greenhouse', 'greenhouse', 'alarmcom', 'https://alarm.com', 1),
  ('Anaplan', 'greenhouse', 'greenhouse', 'anaplan', 'https://anaplan.com', 1),
  ('Appian', 'greenhouse', 'greenhouse', 'appian', 'https://appian.com', 1),
  ('Arize AI', 'greenhouse', 'greenhouse', 'arizeai', 'https://arize.com', 1),
  ('Bandwidth', 'greenhouse', 'greenhouse', 'bandwidth', 'https://bandwidth.com', 1),
  ('Barclays', 'custom', 'workday', 'https://barclays.wd3.myworkdayjobs.com/External_Career_Site_Barclays?country=US', 'https://barclays.com', 2),
  ('Baton Corporation', 'ashby', 'ashby', 'batoncorporation', 'https://batoncorporation.com', 1),
  ('BILL', 'greenhouse', 'greenhouse', 'billcom', 'https://bill.com', 1),
  ('BlackRock', 'custom', 'workday', 'https://blackrock.wd1.myworkdayjobs.com/BlackRock_Professional?country=US', 'https://blackrock.com', 2),
  ('Blue Origin', 'custom', 'workday', 'https://blueorigin.wd5.myworkdayjobs.com/blueorigin?country=US', 'https://blueorigin.com', 2),
  ('Brex', 'greenhouse', 'greenhouse', 'brex', 'https://brex.com', 1),
  ('Capital One', 'custom', 'workday', 'https://capitalone.wd12.myworkdayjobs.com/Capital_One?country=US', 'https://capitalone.com', 2),
  ('Citi', 'custom', 'workday', 'https://citi.wd5.myworkdayjobs.com/2?country=US', 'https://citigroup.com', 2),
  ('Cognition', 'ashby', 'ashby', 'cognition', 'https://cognition.ai', 1),
  ('CoreWeave', 'greenhouse', 'greenhouse', 'coreweave', 'https://coreweave.com', 1),
  ('Dyna Robotics', 'ashby', 'ashby', 'dyna-robotics', 'https://dyna.co', 1),
  ('eBay', 'custom', 'workday', 'https://ebay.wd5.myworkdayjobs.com/apply?country=US', 'https://ebay.com', 2),
  ('Ema', 'ashby', 'ashby', 'ema', 'https://ema.co', 1),
  ('Epic Games', 'greenhouse', 'greenhouse', 'epicgames', 'https://epicgames.com', 1),
  ('Expedia Group', 'custom', 'workday', 'https://expedia.wd108.myworkdayjobs.com/private?country=US', 'https://expediagroup.com', 2),
  ('Fidelity Investments', 'custom', 'workday', 'https://fmr.wd1.myworkdayjobs.com/targeted?country=US', 'https://fidelity.com', 2),
  ('Fidelity National Information Services', 'custom', 'workday', 'https://fis.wd5.myworkdayjobs.com/searchjobs?country=US', 'https://fisglobal.com', 2),
  ('FOX', 'custom', 'workday', 'https://fox.wd1.myworkdayjobs.com/Domestic?country=US', 'https://foxcorporation.com', 2),
  ('G2', 'ashby', 'ashby', 'G2', 'https://g2.com', 1),
  ('Hitachi', 'custom', 'workday', 'https://hitachi.wd1.myworkdayjobs.com/hitachi?country=US', 'https://hitachi.com', 2),
  ('iCapital Network', 'greenhouse', 'greenhouse', 'icapitalnetwork', 'https://icapital.com', 1),
  ('Jerry', 'ashby', 'ashby', 'jerry.ai', 'https://jerry.ai', 1),
  ('KLA', 'custom', 'workday', 'https://kla.wd1.myworkdayjobs.com/Search?country=US', 'https://kla.com', 2),
  ('Latitude AI', 'greenhouse', 'greenhouse', 'latitude', 'https://lat.ai', 1),
  ('LinkedIn', 'custom', 'smartrecruiters', 'LinkedIn3', 'https://linkedin.com', 1),
  ('Lucid Motors', 'greenhouse', 'greenhouse', 'lucidmotors', 'https://lucidmotors.com', 1),
  ('Mastercard', 'custom', 'workday', 'https://mastercard.wd1.myworkdayjobs.com/Campus?country=US', 'https://mastercard.com', 2),
  ('Nectar Social', 'ashby', 'ashby', 'nectar-social', 'https://nectarsocial.com', 1),
  ('Neon Health', 'ashby', 'ashby', 'neon-health', 'https://neonhealth.com', 1),
  ('Nextdoor', 'greenhouse', 'greenhouse', 'nextdoor', 'https://nextdoor.com', 1),
  ('Okta', 'greenhouse', 'greenhouse', 'okta', 'https://okta.com', 1),
  ('onXmaps', 'greenhouse', 'greenhouse', 'onxmaps', 'https://onxmaps.com', 1),
  ('Point72', 'greenhouse', 'greenhouse', 'point72', 'https://point72.com', 1),
  ('Profound', 'ashby', 'ashby', 'Profound', 'https://tryprofound.com', 1),
  ('Pure Storage', 'greenhouse', 'greenhouse', 'purestorage', 'https://purestorage.com', 1),
  ('Quora', 'ashby', 'ashby', 'quora', 'https://quora.com', 1),
  ('Radix Trading', 'greenhouse', 'greenhouse', 'radixuniversity', 'https://radixtrading.co', 1),
  ('Rain', 'ashby', 'ashby', 'rain', 'https://rain.xyz', 1),
  ('RevenueCat', 'ashby', 'ashby', 'revenuecat', 'https://revenuecat.com', 1),
  ('Rivian and Volkswagen Group Technologies', 'ashby', 'ashby', 'rivianvw.tech', 'https://rivianvw.tech', 1),
  ('Ro', 'lever', 'lever', 'ro', 'https://ro.co', 1),
  ('Rocket Lab USA', 'greenhouse', 'greenhouse', 'rocketlab', 'https://rocketlabcorp.com', 1),
  ('Rockstar Games', 'greenhouse', 'greenhouse', 'rockstargames', 'https://rockstargames.com', 1),
  ('Roku', 'greenhouse', 'greenhouse', 'roku', 'https://roku.com', 1),
  ('Rubrik', 'greenhouse', 'greenhouse', 'rubrik', 'https://rubrik.com', 1),
  ('S&P Global', 'custom', 'workday', 'https://spgi.wd5.myworkdayjobs.com/SPGI_Careers?country=US', 'https://spglobal.com', 2),
  ('Salesforce', 'custom', 'workday', 'https://salesforce.wd12.myworkdayjobs.com/External_Career_Site?country=US', 'https://salesforce.com', 2),
  ('Samsung', 'custom', 'workday', 'https://sec.wd3.myworkdayjobs.com/Samsung_Careers?country=US', 'https://samsung.com', 2),
  ('SeatGeek', 'greenhouse', 'greenhouse', 'seatgeek', 'https://seatgeek.com', 1),
  ('Sentra', 'ashby', 'ashby', 'sentra', 'https://sentra.app', 1),
  ('ServiceNow', 'custom', 'smartrecruiters', 'ServiceNow', 'https://servicenow.com', 1),
  ('Shepherd', 'ashby', 'ashby', 'shepherd', 'https://shepherdinsurance.com', 1),
  ('Slack', 'custom', 'workday', 'https://salesforce.wd12.myworkdayjobs.com/Slack?country=US', 'https://slack.com', 2),
  ('Smartsheet', 'greenhouse', 'greenhouse', 'smartsheet', 'https://smartsheet.com', 1),
  ('SoFi', 'greenhouse', 'greenhouse', 'sofi', 'https://sofi.com', 1),
  ('Sony Interactive Entertainment', 'greenhouse', 'greenhouse', 'sonyinteractiveentertainmentglobal', 'https://sonyinteractive.com', 1),
  ('Stevens Capital Management', 'greenhouse', 'greenhouse', 'scm', '', 1),
  ('StubHub', 'greenhouse', 'greenhouse', 'stubhubinc', 'https://stubhub.com', 1),
  ('The Allen Institute for AI', 'greenhouse', 'greenhouse', 'thealleninstitute', 'https://allenai.org', 1),
  ('The Home Depot', 'custom', 'workday', 'https://homedepot.wd5.myworkdayjobs.com/careerdepot?country=US', 'https://homedepot.com', 2),
  ('Torc Robotics', 'greenhouse', 'greenhouse', 'torcrobotics', 'https://torc.ai', 1),
  ('Tubi', 'greenhouse', 'greenhouse', 'tubitv', 'https://tubitv.com', 1),
  ('Twitch', 'greenhouse', 'greenhouse', 'twitch', 'https://twitch.tv', 1),
  ('USAA', 'custom', 'workday', 'https://usaa.wd1.myworkdayjobs.com/USAAJOBSWD?country=US', 'https://usaa.com', 2),
  ('Vanguard', 'custom', 'workday', 'https://vanguard.wd5.myworkdayjobs.com/contractors_restricted?country=US', 'https://vanguard.com', 2),
  ('Veeva Systems', 'lever', 'lever', 'veeva', 'https://veeva.com', 1),
  ('Warner Bros.', 'custom', 'workday', 'https://warnerbros.wd5.myworkdayjobs.com/global?country=US', 'https://warnerbros.com', 2),
  ('Western Digital', 'custom', 'smartrecruiters', 'WesternDigital', 'https://westerndigital.com', 1),
  ('Zoox', 'lever', 'lever', 'zoox', 'https://zoox.com', 1);

INSERT OR IGNORE INTO companies (id, name, ats_type, source_type, ats_slug, website, enabled, poll_tier)
SELECT lower(hex(randomblob(16))), a.name, a.ats_type, a.source_type, a.ats_slug, a.website, 1, a.poll_tier
FROM add_0116_companies a
WHERE NOT EXISTS (
  SELECT 1 FROM companies c
  WHERE LOWER(TRIM(c.name)) = LOWER(TRIM(a.name))
     OR (COALESCE(c.source_type, c.ats_type) = a.source_type AND LOWER(TRIM(c.ats_slug)) = LOWER(TRIM(a.ats_slug)))
);

DROP TABLE add_0116_companies;
