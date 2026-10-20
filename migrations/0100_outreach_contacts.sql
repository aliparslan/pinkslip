-- Outreach for everyone (docs/backend-inventory-2026-10-16.md, step 8).
-- Recruiters the owner confirms in Admin → Recruiters ("works there: yes")
-- are listed on their company's People, at the address the sourcing run
-- guessed (owner, 2026-10-19: until there's a systematic way, and no paid
-- checker for now). Bounces and "I've left" auto-replies seen through
-- forwarding take an address off.

-- The sourcing candidate a contact came from, and their LinkedIn.
ALTER TABLE company_contacts ADD COLUMN candidate_id TEXT REFERENCES recruiter_candidates(id) ON DELETE SET NULL;
ALTER TABLE company_contacts ADD COLUMN profile_url TEXT;
-- listed: on People. hidden: no longer confirmed, or the guessed address
-- changed. bounced: mail to it came back, or they left. removed: they asked
-- to be left alone, details wiped. A row stays while threads point at it.
ALTER TABLE company_contacts ADD COLUMN status TEXT NOT NULL DEFAULT 'listed'
  CHECK (status IN ('listed', 'hidden', 'bounced', 'removed'));

CREATE INDEX idx_company_contacts_candidate ON company_contacts(candidate_id);
CREATE INDEX idx_company_contacts_email ON company_contacts(email);

-- Where the user is told to send: the stand-in while OUTREACH_TEST_RECIPIENT
-- is set, so trying it never emails a real recruiter; null is the contact's
-- own address.
ALTER TABLE outreach_threads ADD COLUMN send_to TEXT;

-- Recruiters who asked to be left alone, as a SHA-256 of the address, so no
-- search or import lists them again and the list itself holds nobody's email.
CREATE TABLE contact_suppressions (
  email_hash TEXT PRIMARY KEY,
  created_at TEXT NOT NULL
);

-- The recruiters already confirmed.
INSERT INTO company_contacts (id, company_id, email, name, title, source, created_at, candidate_id, profile_url, status)
SELECT lower(hex(randomblob(16))), rc.company_id, lower(trim(rc.email_guess)), rc.name,
       COALESCE(NULLIF(rc.current_title, ''), rc.headline), 'sourcing', COALESCE(rc.reviewed_at, rc.seen_at),
       rc.id, rc.profile_url, 'listed'
FROM recruiter_candidates rc
WHERE rc.works_there = 'yes' AND COALESCE(rc.actual_role, '') != 'not_recruiter' AND rc.email_guess IS NOT NULL
ON CONFLICT(company_id, email) DO NOTHING;

-- Tech recruiters only, found more carefully (2026-10-19,
-- docs/recruiter-sourcing-review-2026-10-19.md): the company's own LinkedIn
-- page (found by its website), whether another company shares its name, and
-- where the address format came from: you, GitHub's commits, or the format
-- pages.
ALTER TABLE recruiter_sourcing ADD COLUMN pattern_source TEXT;
ALTER TABLE recruiter_sourcing ADD COLUMN linkedin_slug TEXT;
ALTER TABLE recruiter_sourcing ADD COLUMN linkedin_name TEXT;
ALTER TABLE recruiter_sourcing ADD COLUMN name_shared INTEGER NOT NULL DEFAULT 0;
-- Only the format and how many addresses agree; GitHub's addresses are never kept.
ALTER TABLE recruiter_sourcing ADD COLUMN github_org TEXT;
ALTER TABLE recruiter_sourcing ADD COLUMN github_pattern TEXT;
ALTER TABLE recruiter_sourcing ADD COLUMN github_votes INTEGER NOT NULL DEFAULT 0;
ALTER TABLE recruiter_sourcing ADD COLUMN github_total INTEGER NOT NULL DEFAULT 0;

-- A company's address format as you set it (from a Hunter check), before or
-- after its search: every recruiter's address there is written from it.
CREATE TABLE company_mail_formats (
  company_id TEXT PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  domain TEXT NOT NULL,
  pattern TEXT NOT NULL,
  set_at TEXT NOT NULL
);
