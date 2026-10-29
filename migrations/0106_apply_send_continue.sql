-- A send that carries on in the browser another left open (owner, 2026-10-29:
-- Toast filled its form three times, once to check, once after the answer
-- and once to send). Check first and a stop on questions keep the filled
-- form open for nine minutes; the next send of the job takes the browser
-- over (`browser_session`) and names the send it continues, whose record of
-- what was sent and how far the fill got it carries on.

ALTER TABLE apply_sends ADD COLUMN continued_from TEXT;
