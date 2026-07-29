-- Six of the reconnections in 0052 were silent no-ops.
--
-- That migration used `UPDATE ... WHERE name = ?`, and the candidate list was
-- built against a local development database whose company set had drifted from
-- production. These six rows simply did not exist upstream, so the updates
-- matched nothing and failed quietly. They are inserts, not updates.
--
-- Anduril is the expensive one: ~2,135 upstream postings, several hundred of
-- which pass scope. The poller now caps how many new jobs it matches inline per
-- cycle, so that lands over a few ticks instead of in one.
INSERT OR IGNORE INTO companies (id, name, ats_type, source_type, ats_slug, website, enabled, poll_tier)
VALUES
  (lower(hex(randomblob(16))), 'Anduril', 'greenhouse', 'greenhouse', 'andurilindustries', 'anduril.com', 1, 1),
  (lower(hex(randomblob(16))), 'Wiz', 'greenhouse', 'greenhouse', 'wizinc', 'wiz.io', 1, 1),
  (lower(hex(randomblob(16))), '1Password', 'ashby', 'ashby', '1password', '1password.com', 1, 1),
  (lower(hex(randomblob(16))), 'Sentry', 'ashby', 'ashby', 'sentry', 'sentry.io', 1, 1),
  (lower(hex(randomblob(16))), 'Character.ai', 'ashby', 'ashby', 'character', 'character.ai', 1, 1),
  (lower(hex(randomblob(16))), 'Zapier', 'ashby', 'ashby', 'zapier', 'zapier.com', 1, 1);
