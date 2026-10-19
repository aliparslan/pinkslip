-- Outreach for everyone (docs/backend-inventory-2026-10-16.md, step 8).
-- Only addresses an email checker passed reach users. The check repeats
-- weekly, and a bounce seen through forwarding marks an address bad at once.

-- 'shared' is a team inbox (university@, campus@); 'person' is one recruiter.
ALTER TABLE company_contacts ADD COLUMN kind TEXT NOT NULL DEFAULT 'person'
  CHECK (kind IN ('person', 'shared'));
-- unchecked → valid, catch_all (the domain takes any address, so it can't be
-- checked), unknown (the check didn't finish) or invalid. bounced and removed
-- are final: removed is a recruiter who asked, with their details wiped.
-- rejected is an admin's "not useful", kept only while threads point at it.
ALTER TABLE company_contacts ADD COLUMN email_status TEXT NOT NULL DEFAULT 'unchecked'
  CHECK (email_status IN ('unchecked', 'valid', 'catch_all', 'unknown', 'invalid', 'bounced', 'rejected', 'removed'));
ALTER TABLE company_contacts ADD COLUMN checked_at TEXT;
-- The page that shows the address; null for a guess the checker confirmed or an import.
ALTER TABLE company_contacts ADD COLUMN evidence_url TEXT;

CREATE INDEX idx_company_contacts_checked ON company_contacts(checked_at);
CREATE INDEX idx_company_contacts_email ON company_contacts(email);

-- Addresses that never come back: a recruiter who asked to be left alone
-- ('asked'), or one an admin turned down ('rejected'). Kept as a SHA-256 of
-- the address, so the list itself holds nobody's email.
CREATE TABLE contact_suppressions (
  email_hash TEXT PRIMARY KEY,
  reason TEXT NOT NULL CHECK (reason IN ('asked', 'rejected')),
  created_at TEXT NOT NULL
);

-- The shared-inbox search, one row per company: the domain it tried and
-- how it ended, so every company shows up even when nothing was found.
CREATE TABLE contact_finding (
  company_id TEXT PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  mail_domain TEXT,
  outcome TEXT NOT NULL CHECK (outcome IN ('found', 'none', 'catch_all', 'no_mail', 'error')),
  found INTEGER NOT NULL DEFAULT 0,
  checks INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  ran_at TEXT NOT NULL
);
