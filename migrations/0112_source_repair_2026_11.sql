-- Source repair, 2026-11-08. These 15 sources were failing in production and
-- none had open jobs. Every board in repair_0112_moves was read through
-- Pinkslip's own adapter on 2026-11-08. The retired rows have no board Pinkslip
-- can read. See docs/housekeeping-2026-11-08.md.
--
-- Rows match on name, source and the dead slug, so a source already fixed in
-- the admin is left alone. Hugging Face and Two Sigma use the new Workable and
-- Avature adapters.

CREATE TABLE repair_0112_moves (
  name TEXT NOT NULL,
  old_source_type TEXT NOT NULL,
  old_slug TEXT NOT NULL,
  ats_type TEXT NOT NULL,
  source_type TEXT NOT NULL,
  ats_slug TEXT NOT NULL,
  poll_tier INTEGER NOT NULL
);

INSERT INTO repair_0112_moves VALUES
  ('Autodesk', 'workday', 'https://autodesk.wd1.myworkdayjobs.com/en-US/Ext?country=US', 'custom', 'eightfold', 'https://autodesk.eightfold.ai/careers?domain=autodesk.com', 2),
  ('CrowdStrike', 'greenhouse', 'crowdstrike', 'custom', 'workday', 'https://crowdstrike.wd5.myworkdayjobs.com/crowdstrikecareers?country=US', 1),
  ('Hudson River Trading', 'greenhouse', 'hudsonrivertrading', 'greenhouse', 'greenhouse', 'wehrtyou', 1),
  ('Hugging Face', 'greenhouse', 'huggingface', 'custom', 'workable', 'huggingface', 1),
  ('Mistral AI', 'ashby', 'mistral', 'ashby', 'ashby', 'mistral.ai', 1),
  ('Old Mission Capital', 'greenhouse', 'oldmissioncapital', 'ashby', 'ashby', 'old-mission-capital', 1),
  ('Prisma', 'greenhouse', 'prisma', 'custom', 'rippling', 'prisma-careers', 1),
  ('Retool', 'ashby', 'retool', 'custom', 'gem', 'retool', 1),
  ('Slingshot Aerospace', 'greenhouse', 'slingshotaerospace', 'ashby', 'ashby', 'slingshot-aerospace', 1),
  ('Two Sigma', 'greenhouse', 'twosigma', 'custom', 'avature', 'https://careers.twosigma.com/careers/OpenRoles', 2);

CREATE TABLE repair_0112_retired (
  name TEXT NOT NULL,
  old_source_type TEXT NOT NULL,
  old_slug TEXT NOT NULL,
  reason TEXT NOT NULL
);

INSERT INTO repair_0112_retired VALUES
  ('Decart', 'ashby', 'decart-ai', 'no public job board found'),
  ('Deno', 'lever', 'deno', 'joining Cloudflare; careers page is gone'),
  ('Levels', 'ashby', 'levels', 'careers are a Notion page; no job board'),
  ('Ona', 'ashby', 'ona', 'now part of OpenAI; its Ashby board is gone'),
  ('Shopify', 'greenhouse', 'shopify', 'jobs are on Ashby with its public jobs API switched off, which Pinkslip can''t read');

-- Skipped when the new board is already another source, which keeps both unique
-- indexes satisfied. The row stays as it is, failing, for a person to look at.
UPDATE companies
SET (ats_type, source_type, ats_slug, poll_tier) = (
      SELECT m.ats_type, m.source_type, m.ats_slug, m.poll_tier
      FROM repair_0112_moves m
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
  SELECT 1 FROM repair_0112_moves m
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

-- Disabled rather than deleted, so saved and applied jobs keep their company.
-- The reason replaces the last error, which only said the board was a 404.
UPDATE companies
SET enabled = 0,
    quarantined_at = NULL,
    poll_failure_count = 0,
    last_poll_status = NULL,
    last_poll_error = (
      SELECT r.reason FROM repair_0112_retired r
      WHERE r.name = companies.name
        AND r.old_source_type = COALESCE(companies.source_type, companies.ats_type)
        AND r.old_slug = companies.ats_slug
    )
WHERE EXISTS (
  SELECT 1 FROM repair_0112_retired r
  WHERE r.name = companies.name
    AND r.old_source_type = COALESCE(companies.source_type, companies.ats_type)
    AND r.old_slug = companies.ats_slug
);

DROP TABLE repair_0112_moves;
DROP TABLE repair_0112_retired;
