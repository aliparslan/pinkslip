-- The date that goes with an application's stage: when you'll hear back
-- (Applied), when the assessment is due, when the interview is, when to reply
-- to the offer by. One per application; changing the stage clears it
-- (docs/redesign-wireframes.md, "The application page").
--
-- A calendar day ("2026-10-15") when only the day is known, otherwise an
-- ISO 8601 instant.
ALTER TABLE applications ADD COLUMN stage_date TEXT;
