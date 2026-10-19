-- Pay by place (owner, 2026-10-19; docs/pay-by-place-2026-10-19.md): every
-- pay range a posting lists, each with the zone or places it covers, as
-- JSON. `salary` stays as it is for builds already on phones. Null until the
-- job's source is read with ranges; '[]' once read and none were listed.
ALTER TABLE jobs ADD COLUMN pay_ranges TEXT;
