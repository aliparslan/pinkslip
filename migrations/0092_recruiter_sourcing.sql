-- Recruiter sourcing under evaluation (docs/recruiter-contacts-sourcing.md).
-- People found through search results wait here for an admin to label;
-- nothing in these tables reaches users. Outreach still reads only
-- company_contacts.

-- The latest sourcing run for each company: where its mail goes and the
-- address format the email-format pages agree on.
CREATE TABLE recruiter_sourcing (
  company_id TEXT PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  site TEXT NOT NULL,
  mail_domain TEXT NOT NULL,
  mail_domain_source TEXT NOT NULL CHECK (mail_domain_source IN ('website', 'format pages')),
  mail_provider TEXT,
  pattern TEXT,
  pattern_votes INTEGER NOT NULL DEFAULT 0,
  pattern_sources INTEGER NOT NULL DEFAULT 0,
  searches INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  ran_at TEXT NOT NULL
);

-- Everyone a run found, kept or left out, so wrongly dropped people can be
-- caught too. Labels survive later runs of the same company.
CREATE TABLE recruiter_candidates (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  profile_url TEXT NOT NULL,
  name TEXT NOT NULL,
  headline TEXT NOT NULL DEFAULT '',
  current_title TEXT,
  current_employer TEXT,
  location TEXT,
  kind TEXT NOT NULL CHECK (kind IN ('early_career', 'technical', 'recruiter', 'coordinator', 'intern', 'other')),
  kind_from_snippet INTEGER NOT NULL DEFAULT 0,
  employer_evidence TEXT NOT NULL,
  -- Null when kept.
  left_out_reason TEXT,
  email_guess TEXT,
  email_confidence TEXT,
  found_at TEXT NOT NULL,
  seen_at TEXT NOT NULL,
  works_there TEXT CHECK (works_there IN ('yes', 'no', 'unsure')),
  actual_role TEXT CHECK (actual_role IN ('early_career', 'other_recruiter', 'not_recruiter')),
  reviewed_at TEXT,
  UNIQUE (company_id, profile_url)
);

CREATE INDEX idx_recruiter_candidates_company ON recruiter_candidates(company_id);
