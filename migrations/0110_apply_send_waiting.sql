-- A send that stopped on questions waits a day for the person, then lapses;
-- Don't send drops it sooner (owner, 2026-11-04, Paper "Stopped sends ·
-- Nov 4"). Answers given in the sheet are kept here until Send all.
--   dropped_at: Don't send.
--   told_at: a push (alone, or with the rest of its run) said it was waiting.
--   reminded_at: the one reminder went.
--   answered_json: { [ref]: value } given so far.

ALTER TABLE apply_sends ADD COLUMN dropped_at TEXT;
ALTER TABLE apply_sends ADD COLUMN told_at TEXT;
ALTER TABLE apply_sends ADD COLUMN reminded_at TEXT;
ALTER TABLE apply_sends ADD COLUMN answered_json TEXT;
