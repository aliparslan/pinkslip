-- Source catalog repair. Every board in repair_0087_moves was read through
-- Pinkslip's own adapter on 2026-10-12 and its postings name the company; the
-- audit, with job counts and the reasoning for each row, is
-- docs/source-health-2026-10-12.md. All 130 sources here were failing with a
-- 404 because the board no longer exists under the stored slug.
--
-- Rows are matched on name, source and the dead slug, so a source already
-- fixed in the admin is left alone. Fixed sources leave quarantine and rejoin
-- the normal cadence on the next tick.

CREATE TABLE repair_0087_moves (
  name TEXT NOT NULL,
  old_source_type TEXT NOT NULL,
  old_slug TEXT NOT NULL,
  ats_type TEXT NOT NULL,
  source_type TEXT NOT NULL,
  ats_slug TEXT NOT NULL,
  poll_tier INTEGER NOT NULL,
  new_name TEXT,
  new_website TEXT
);

INSERT INTO repair_0087_moves VALUES
  ('Akiflow', 'greenhouse', 'akiflow', 'custom', 'yc', 'akiflow', 2, NULL, NULL),
  ('Alchemy', 'greenhouse', 'alchemy', 'ashby', 'ashby', 'alchemy', 1, NULL, NULL),
  ('Aleph Alpha', 'greenhouse', 'alephalpha', 'ashby', 'ashby', 'alephalpha', 1, NULL, NULL),
  ('Amplitude', 'greenhouse', 'amplitude', 'ashby', 'ashby', 'amplitude', 1, NULL, NULL),
  ('Applied Intuition', 'greenhouse', 'appliedintuition', 'ashby', 'ashby', 'applied', 1, NULL, NULL),
  ('Belvedere Trading', 'greenhouse', 'belvederetrading', 'lever', 'lever', 'belvederetrading', 1, NULL, NULL),
  ('Bilt Rewards', 'greenhouse', 'biltrewards', 'custom', 'gem', 'bilt', 1, NULL, NULL),
  ('Boom Supersonic', 'greenhouse', 'boomsupersonic', 'custom', 'rippling', 'boom-supersonic', 1, NULL, NULL),
  ('Boston Dynamics', 'greenhouse', 'bostondynamics', 'custom', 'workday', 'https://bostondynamics.wd1.myworkdayjobs.com/en-US/Boston_Dynamics?country=US', 1, NULL, NULL),
  ('ClickHouse', 'greenhouse', 'clickhouse', 'ashby', 'ashby', 'clickhouse', 1, NULL, NULL),
  ('Coalition', 'greenhouse', 'coalitioninc', 'greenhouse', 'greenhouse', 'coalition', 1, NULL, NULL),
  ('Coder', 'greenhouse', 'coder', 'ashby', 'ashby', 'coder', 1, NULL, NULL),
  ('Commonwealth Fusion Systems', 'greenhouse', 'commonwealthfusionsystems', 'lever', 'lever', 'cfsenergy', 1, NULL, NULL),
  ('Continue', 'ashby', 'continue', 'custom', 'yc', 'continue', 2, NULL, NULL),
  ('Convex', 'ashby', 'convex', 'ashby', 'ashby', 'convex-dev', 1, NULL, NULL),
  ('Courier', 'ashby', 'courier', 'custom', 'yc', 'courier', 2, NULL, NULL),
  ('Eight Sleep', 'greenhouse', 'eightsleep', 'ashby', 'ashby', 'eightsleep', 1, NULL, NULL),
  ('Fireflies', 'greenhouse', 'firefliesai', 'custom', 'gem', 'fireflies', 1, NULL, NULL),
  ('Five Rings', 'greenhouse', 'fiverings', 'greenhouse', 'greenhouse', 'fiveringsllc', 1, NULL, NULL),
  ('Form Energy', 'greenhouse', 'formenergy', 'ashby', 'ashby', 'formenergy', 1, NULL, NULL),
  ('Function Health', 'ashby', 'functionhealth', 'custom', 'gem', 'function-health', 1, NULL, NULL),
  ('Hadrian', 'ashby', 'hadrian', 'custom', 'gem', 'hadrian', 1, NULL, NULL),
  ('Hasura', 'greenhouse', 'hasura', 'custom', 'gem', 'promptql', 1, 'PromptQL', 'https://promptql.io'),
  ('Headlands Tech', 'greenhouse', 'headlandstech', 'greenhouse', 'greenhouse', 'headlandstechnologiesllc', 1, NULL, NULL),
  ('Heirloom', 'greenhouse', 'heirloomcarbon', 'ashby', 'ashby', 'heirloomcarbon', 1, NULL, NULL),
  ('Helion Energy', 'greenhouse', 'helionenergy', 'ashby', 'ashby', 'helion', 1, NULL, NULL),
  ('Hermeus', 'greenhouse', 'hermeus', 'lever', 'lever', 'hermeus', 1, NULL, NULL),
  ('Hightouch', 'greenhouse', 'hightouch', 'ashby', 'ashby', 'hightouch', 1, NULL, NULL),
  ('Hims & Hers', 'greenhouse', 'forhims', 'ashby', 'ashby', 'hims-and-hers', 1, NULL, NULL),
  ('Hippo', 'greenhouse', 'hippoinsurance', 'greenhouse', 'greenhouse', 'hippo70', 1, NULL, NULL),
  ('Hopper', 'greenhouse', 'hopper', 'ashby', 'ashby', 'hopper', 1, NULL, NULL),
  ('Inceptive', 'ashby', 'inceptive', 'greenhouse', 'greenhouse', 'inceptive', 1, NULL, NULL),
  ('Increase', 'ashby', 'increase', 'custom', 'yc', 'increase', 2, NULL, NULL),
  ('Insitro', 'greenhouse', 'insitro', 'ashby', 'ashby', 'insitro', 1, NULL, NULL),
  ('K2 Space', 'ashby', 'k2space', 'greenhouse', 'greenhouse', 'k2spacecorporation', 1, NULL, NULL),
  ('Kit (ConvertKit)', 'greenhouse', 'kit', 'ashby', 'ashby', 'kit', 1, NULL, NULL),
  ('Kraken', 'greenhouse', 'payward', 'ashby', 'ashby', 'kraken.com', 1, NULL, NULL),
  ('Linktree', 'greenhouse', 'linktree', 'custom', 'gem', 'linktree', 1, NULL, NULL),
  ('M1 Finance', 'greenhouse', 'm1finance', 'custom', 'smartrecruiters', 'M1Finance', 1, NULL, NULL),
  ('Magic Eden', 'greenhouse', 'magiceden', 'ashby', 'ashby', 'magiceden', 1, NULL, NULL),
  ('Motion', 'greenhouse', 'usemotion', 'custom', 'yc', 'motion', 2, NULL, NULL),
  ('Opendoor', 'greenhouse', 'opendoor', 'custom', 'rippling', 'opendoor', 1, NULL, NULL),
  ('OpenSea', 'greenhouse', 'opensea', 'ashby', 'ashby', 'opensea', 1, NULL, NULL),
  ('Oura', 'greenhouse', 'ouraring', 'greenhouse', 'greenhouse', 'oura', 1, NULL, NULL),
  ('Pacific Fusion', 'ashby', 'pacificfusion', 'greenhouse', 'greenhouse', 'pacificfusion', 1, NULL, NULL),
  ('Palantir', 'greenhouse', 'palantir', 'lever', 'lever', 'palantir', 1, NULL, NULL),
  ('Persona', 'greenhouse', 'withpersona', 'ashby', 'ashby', 'persona', 1, NULL, NULL),
  ('Pilot', 'greenhouse', 'pilot', 'greenhouse', 'greenhouse', 'pilothq', 1, NULL, NULL),
  ('Polygon Labs', 'greenhouse', 'polygonlabs', 'ashby', 'ashby', 'polygon-labs', 1, NULL, NULL),
  ('Porter', 'ashby', 'porter', 'custom', 'yc', 'porter', 2, NULL, NULL),
  ('Postmark', 'greenhouse', 'activecampaign', 'lever', 'lever', 'activecampaign', 1, 'ActiveCampaign', 'https://www.activecampaign.com'),
  ('Pulumi', 'greenhouse', 'pulumi', 'greenhouse', 'greenhouse', 'pulumicorporation', 1, NULL, NULL),
  ('QuickNode', 'greenhouse', 'quicknode', 'ashby', 'ashby', 'quicknode', 1, NULL, NULL),
  ('Read.ai', 'ashby', 'readai', 'ashby', 'ashby', 'read-ai', 1, NULL, NULL),
  ('Rho', 'greenhouse', 'rho', 'ashby', 'ashby', 'rho', 1, NULL, NULL),
  ('Ro', 'greenhouse', 'ro', 'lever', 'lever', 'ro', 1, NULL, NULL),
  ('Root Insurance', 'greenhouse', 'rootinsurance', 'custom', 'rippling', 'joinroot', 1, NULL, NULL),
  ('SigmaOS', 'greenhouse', 'sigmaos', 'custom', 'yc', 'sigmaos', 2, NULL, NULL),
  ('Sisense', 'greenhouse', 'sisense', 'ashby', 'ashby', 'sisense', 1, NULL, NULL),
  ('Speakeasy', 'ashby', 'speakeasyapi', 'ashby', 'ashby', 'speakeasy', 1, NULL, NULL),
  ('Stoke Space', 'greenhouse', 'stokespace', 'greenhouse', 'greenhouse', 'stokespacetechnologies', 1, NULL, NULL),
  ('Strava', 'greenhouse', 'strava', 'ashby', 'ashby', 'strava', 1, NULL, NULL),
  ('Sublime Systems', 'greenhouse', 'sublimesystems', 'lever', 'lever', 'SublimeSystems', 1, NULL, NULL),
  ('Synctera', 'greenhouse', 'synctera', 'ashby', 'ashby', 'synctera', 1, NULL, NULL),
  ('Temporal', 'greenhouse', 'temporaltechnologies', 'ashby', 'ashby', 'temporal', 1, NULL, NULL),
  ('Tinybird', 'greenhouse', 'tinybird', 'lever', 'lever', 'tinybird', 1, NULL, NULL),
  ('Twelve', 'greenhouse', 'twelve', 'ashby', 'ashby', 'twelve', 1, NULL, NULL),
  ('Uniswap Labs', 'greenhouse', 'uniswaplabs', 'ashby', 'ashby', 'uniswap', 1, NULL, NULL),
  ('Unit', 'greenhouse', 'unit', 'ashby', 'ashby', 'unit', 1, NULL, NULL),
  ('Vannevar Labs', 'ashby', 'vannevarlabs', 'greenhouse', 'greenhouse', 'vannevarlabs', 1, NULL, NULL),
  ('Vimcal', 'ashby', 'vimcal', 'custom', 'yc', 'vimcal', 2, NULL, NULL),
  ('Wayve', 'greenhouse', 'wayve', 'ashby', 'ashby', 'wayve', 1, NULL, NULL),
  ('Wealthfront', 'greenhouse', 'wealthfrontcareers', 'lever', 'lever', 'wealthfront', 1, NULL, NULL),
  ('Webull', 'greenhouse', 'webull', 'custom', 'rippling', 'webull', 1, NULL, NULL),
  ('Wispr Flow', 'ashby', 'wisprflow', 'ashby', 'ashby', 'wispr-flow', 1, NULL, NULL),
  ('WorkOS', 'greenhouse', 'workos', 'ashby', 'ashby', 'workos', 1, NULL, NULL),
  ('World Labs', 'greenhouse', 'worldlabs', 'ashby', 'ashby', 'worldlabs', 1, NULL, NULL),
  ('Xaira Therapeutics', 'ashby', 'xaira', 'greenhouse', 'greenhouse', 'xairatherapeutics', 1, NULL, NULL);

CREATE TABLE repair_0087_retired (
  name TEXT NOT NULL,
  old_source_type TEXT NOT NULL,
  old_slug TEXT NOT NULL,
  reason TEXT NOT NULL
);

INSERT INTO repair_0087_retired VALUES
  ('Aiven', 'greenhouse', 'aiven', 'jobs are on Greenhouse EU region, which Pinkslip can''t read'),
  ('Amie', 'ashby', 'amie', 'no public job board found'),
  ('Aurora Innovation', 'greenhouse', 'aurorainnovation', 'no public job board found'),
  ('Beehiiv', 'ashby', 'beehiiv', 'jobs are on BambooHR, which Pinkslip can''t read'),
  ('Better Stack', 'ashby', 'betterstack', 'only a dormant Gem board from 2024 whose owner couldn''t be confirmed'),
  ('Bolt', 'greenhouse', 'bolt', 'bolt.com redirects to a domain-holding page'),
  ('Chainlink Labs', 'greenhouse', 'chainlinklabs', 'no public job board found'),
  ('Cherry', 'ashby', 'withcherry', 'jobs are on Ashby, with its public jobs API switched off, which Pinkslip can''t read'),
  ('Circle', 'greenhouse', 'circle', 'jobs are on Phenom (careers.circle.com), which Pinkslip can''t read'),
  ('Climeworks', 'greenhouse', 'climeworks', 'site blocks automated requests'),
  ('Coherence', 'ashby', 'coherence', 'no public job board found'),
  ('Composer', 'ashby', 'composer', 'no public job board found'),
  ('Decart', 'ashby', 'decart', 'no public job board found'),
  ('DeepMind', 'greenhouse', 'deepmind', 'careers page links no job board (roles may be on Google''s own site)'),
  ('Depop', 'greenhouse', 'depop', 'site blocks automated requests'),
  ('Dynamic', 'ashby', 'dynamic', 'acquired by Fireblocks'),
  ('EpiSci', 'greenhouse', 'episci', 'acquired by Applied Intuition; already a source'),
  ('eToro', 'greenhouse', 'etoro', 'jobs are on Comeet, which Pinkslip can''t read'),
  ('Etsy', 'greenhouse', 'etsy', 'careers.etsy.com links no supported board'),
  ('Gitpod', 'ashby', 'gitpod', 'renamed Ona; no public Ashby board under ona'),
  ('Highlight.io', 'ashby', 'highlight', 'acquired by LaunchDarkly; already a source'),
  ('Kagi', 'greenhouse', 'kagi', 'no public job board found'),
  ('Kinde', 'ashby', 'kinde', 'no public job board found'),
  ('Koyeb', 'ashby', 'koyeb', 'no public job board found'),
  ('Lamini', 'ashby', 'lamini', 'no public job board found'),
  ('Liblab', 'ashby', 'liblab', 'no public job board found'),
  ('Marqeta', 'greenhouse', 'marqeta', 'no public job board found'),
  ('MultiOn', 'ashby', 'multion', 'renamed The AGI Company; no job board linked'),
  ('Northflank', 'ashby', 'northflank', 'no public job board found'),
  ('PEAK6', 'greenhouse', 'peak6', 'no public job board found'),
  ('Petal', 'greenhouse', 'petal', 'no public job board found'),
  ('PostgresML', 'ashby', 'postgresml', 'no public job board found'),
  ('Preferred Networks', 'greenhouse', 'preferrednetworks', 'no public job board found'),
  ('Qodo (Codium)', 'ashby', 'qodo', 'no public job board found'),
  ('Redpanda', 'greenhouse', 'redpandadata', 'no public job board found'),
  ('Replicate', 'ashby', 'replicate', 'acquired by Cloudflare; already a source'),
  ('Resy', 'greenhouse', 'resy', 'no public job board found'),
  ('Riverside', 'greenhouse', 'riversidefm', 'jobs are on Comeet, which Pinkslip can''t read'),
  ('Spacelift', 'greenhouse', 'spacelift', 'jobs are on Teamtailor, which Pinkslip can''t read'),
  ('Stan', 'ashby', 'stanstore', 'no public job board found'),
  ('Stytch', 'greenhouse', 'stytch', 'acquired by Twilio; already a source'),
  ('Superhuman', 'greenhouse', 'superhuman', 'now part of Grammarly; Grammarly''s Greenhouse board is gone too'),
  ('Susquehanna (SIG)', 'greenhouse', 'sig', 'jobs are on iCIMS, which Pinkslip can''t read'),
  ('TAE Technologies', 'greenhouse', 'taetechnologies', 'no public job board found'),
  ('Tembo', 'ashby', 'tembo', 'no public job board found'),
  ('Tigris Data', 'ashby', 'tigrisdata', 'no public job board found'),
  ('Tock', 'greenhouse', 'tock', 'site blocks automated requests'),
  ('Turso', 'ashby', 'turso', 'no public job board found'),
  ('Wave', 'ashby', 'wavemusic', 'no public job board found'),
  ('Whatnot', 'greenhouse', 'whatnot', 'duplicate of the working YC source whatnot'),
  ('Wolverine Trading', 'greenhouse', 'wolverinetrading', 'jobs are on Pinpoint, which Pinkslip can''t read'),
  ('Xata', 'ashby', 'xata', 'no public job board found');

-- ── Jobs from the dead boards ───────────────────────────────────────────────
-- A board that answers 404 has no open jobs. The poller never closed these
-- because every poll failed first. Any that reappear on the new board under the
-- same ID are reopened by the next poll.
UPDATE jobs
SET closed_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE closed_at IS NULL
  AND company_id IN (
    SELECT companies.id FROM companies, repair_0087_moves m
    WHERE m.name = companies.name
    AND m.old_source_type = COALESCE(companies.source_type, companies.ats_type)
    AND m.old_slug = companies.ats_slug
    UNION
    SELECT companies.id FROM companies, repair_0087_retired r
    WHERE r.name = companies.name
    AND r.old_source_type = COALESCE(companies.source_type, companies.ats_type)
    AND r.old_slug = companies.ats_slug
  );

-- A board that only changed its slug can keep its job IDs, and a reopened job
-- keeps its stored link, so point hosted-board links at the new slug.
UPDATE jobs
SET url = (
  SELECT REPLACE(jobs.url, '/' || m.old_slug || '/', '/' || m.ats_slug || '/')
  FROM companies, repair_0087_moves m
  WHERE companies.id = jobs.company_id
    AND m.name = companies.name
    AND m.old_source_type = COALESCE(companies.source_type, companies.ats_type)
    AND m.old_slug = companies.ats_slug
)
WHERE company_id IN (
    SELECT companies.id FROM companies, repair_0087_moves m
    WHERE m.name = companies.name
    AND m.old_source_type = COALESCE(companies.source_type, companies.ats_type)
    AND m.old_slug = companies.ats_slug
      AND m.old_source_type = m.source_type
  )
  AND (url LIKE '%greenhouse.io/%' OR url LIKE '%jobs.ashbyhq.com/%' OR url LIKE '%jobs.lever.co/%');

-- ── Re-point moved boards ───────────────────────────────────────────────────
-- Skipped when the new board is already another source (both unique indexes
-- are checked); that row is retired below instead.
UPDATE companies
SET (name, ats_type, source_type, ats_slug, website, poll_tier) = (
      SELECT COALESCE(m.new_name, companies.name), m.ats_type, m.source_type,
             m.ats_slug, COALESCE(m.new_website, companies.website), m.poll_tier
      FROM repair_0087_moves m
      WHERE m.name = companies.name
    AND m.old_source_type = COALESCE(companies.source_type, companies.ats_type)
    AND m.old_slug = companies.ats_slug
    ),
    enabled = 1,
    quarantined_at = NULL,
    poll_failure_count = 0,
    last_poll_status = NULL,
    last_poll_error = NULL,
    last_poll_job_count = NULL
WHERE EXISTS (
  SELECT 1 FROM repair_0087_moves m
  WHERE m.name = companies.name
    AND m.old_source_type = COALESCE(companies.source_type, companies.ats_type)
    AND m.old_slug = companies.ats_slug
    AND NOT EXISTS (
      SELECT 1 FROM companies other
      WHERE other.id != companies.id
        AND LOWER(TRIM(other.ats_slug)) = LOWER(TRIM(m.ats_slug))
        AND (other.source_type = m.source_type OR other.ats_type = m.ats_type)
    )
);

-- ── Retire the rest ─────────────────────────────────────────────────────────
-- Disabled rather than deleted, so saved and applied jobs keep their company.
-- The last error stays as the record of why; clearing the status and
-- quarantine takes the row out of "needs attention".
UPDATE companies
SET enabled = 0,
    quarantined_at = NULL,
    poll_failure_count = 0,
    last_poll_status = NULL
WHERE EXISTS (
    SELECT 1 FROM repair_0087_retired r
    WHERE r.name = companies.name
    AND r.old_source_type = COALESCE(companies.source_type, companies.ats_type)
    AND r.old_slug = companies.ats_slug
  )
  OR EXISTS (
    SELECT 1 FROM repair_0087_moves m
    WHERE m.name = companies.name
    AND m.old_source_type = COALESCE(companies.source_type, companies.ats_type)
    AND m.old_slug = companies.ats_slug
  );

-- Eight Sleep was also a YC source, which lists 13 of the 37 jobs on the Ashby
-- board above. Keep one source per company: the complete board.
UPDATE jobs
SET closed_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE closed_at IS NULL
  AND company_id IN (
    SELECT id FROM companies
    WHERE name = 'Eight Sleep' AND source_type = 'yc' AND ats_slug = 'eight-sleep'
  )
  AND EXISTS (
    SELECT 1 FROM companies
    WHERE source_type = 'ashby' AND ats_slug = 'eightsleep' AND enabled = 1
  );

UPDATE companies
SET enabled = 0
WHERE name = 'Eight Sleep' AND source_type = 'yc' AND ats_slug = 'eight-sleep'
  AND EXISTS (
    SELECT 1 FROM companies
    WHERE source_type = 'ashby' AND ats_slug = 'eightsleep' AND enabled = 1
  );

DROP TABLE repair_0087_moves;
DROP TABLE repair_0087_retired;
