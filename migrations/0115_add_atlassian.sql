-- Atlassian, requested by a user and approved by the owner on 2026-11-08. It
-- reads through the new Atlassian adapter from the careers site's own listing.
INSERT OR IGNORE INTO companies (id, name, ats_type, source_type, ats_slug, website, enabled, poll_tier)
VALUES ('atlassian', 'Atlassian', 'custom', 'atlassian', 'atlassian', 'https://www.atlassian.com', 1, 1);
