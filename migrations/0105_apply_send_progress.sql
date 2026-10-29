-- The send screens (Paper "Send screens · the missing states · Oct 24"): how
-- far a send's fill has got, so the job page's button can say "Applying · 11
-- of 17 filled". The resume counts as one. Null until the fill starts.

ALTER TABLE apply_sends ADD COLUMN fill_done INTEGER;
ALTER TABLE apply_sends ADD COLUMN fill_total INTEGER;
