-- a16z-backed companies the owner approved on the review of 2026-11-09. Each board
-- was read and each website opened and compared with the company. Lumos uses the
-- identity company's Ashby board, not the fiber provider's Greenhouse board of the
-- same name. Pryzm renamed itself Belisar. See docs/housekeeping-2026-11-08.md.
--
-- They arrive disabled so their open catalog can be backfilled without reaching
-- anyone as new-job alerts (shouldQueueNotificationsForCompany); 0125 turns them
-- on once the backfill has run. Hourly tier, as the long tail is.
-- A source that already exists under either unique index is skipped.

CREATE TABLE add_0124_companies (
  name TEXT NOT NULL,
  ats_type TEXT NOT NULL,
  source_type TEXT NOT NULL,
  ats_slug TEXT NOT NULL,
  website TEXT NOT NULL
);

INSERT INTO add_0124_companies VALUES
  ('Backflip AI', 'ashby', 'ashby', 'backflip.ai', 'https://backflip.ai'),
  ('Belisar', 'ashby', 'ashby', 'belisar', 'https://belisar.com'),
  ('Braintrust', 'ashby', 'ashby', 'Braintrust', 'https://braintrust.dev'),
  ('Cluely', 'ashby', 'ashby', 'cluely', 'https://cluely.com'),
  ('Clutch', 'ashby', 'ashby', 'withclutch', 'https://withclutch.com'),
  ('Crux', 'ashby', 'ashby', 'cruxclimate', 'https://crux.com'),
  ('Flow', 'lever', 'lever', 'flowlife', 'https://flow.life'),
  ('Lumos', 'ashby', 'ashby', 'lumos', 'https://lumos.com'),
  ('Material Security', 'ashby', 'ashby', 'materialsecurity', 'https://material.security'),
  ('Pomelo Care', 'ashby', 'ashby', 'pomelo-care', 'https://pomelocare.com'),
  ('Promise', 'ashby', 'ashby', 'promise', 'https://promise-pay.com'),
  ('Rillet', 'ashby', 'ashby', 'rillet', 'https://rillet.com'),
  ('Standard Nuclear', 'greenhouse', 'greenhouse', 'standardnuclearinc', 'https://standardnuclear.com'),
  ('Thyme Care', 'ashby', 'ashby', 'thyme-care', 'https://thymecare.com'),
  ('Town', 'ashby', 'ashby', 'town', 'https://town.com'),
  ('Wingspan', 'greenhouse', 'greenhouse', 'wingspan', 'https://wingspan.app'),
  ('Yuno', 'lever', 'lever', 'yuno', 'https://y.uno');

INSERT OR IGNORE INTO companies (id, name, ats_type, source_type, ats_slug, website, enabled, poll_tier)
SELECT lower(hex(randomblob(16))), a.name, a.ats_type, a.source_type, a.ats_slug, a.website, 0, 2
FROM add_0124_companies a
WHERE NOT EXISTS (
  SELECT 1 FROM companies c
  WHERE LOWER(TRIM(c.name)) = LOWER(TRIM(a.name))
     OR (COALESCE(c.source_type, c.ats_type) = a.source_type AND LOWER(TRIM(c.ats_slug)) = LOWER(TRIM(a.ats_slug)))
);

DROP TABLE add_0124_companies;
