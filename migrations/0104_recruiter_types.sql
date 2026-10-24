-- Recruiter types (owner, 2026-10-24; docs/recruiter-types-2026-10-19.md,
-- Decided): who they hire, what for, their job, and agency or contract. The
-- owner confirms them in Admin → Recruiters; until then the title's
-- suggestion stands in (shared/recruiter-review.ts). They decide who's
-- listed on People and in what order.

-- JSON arrays: interns, new_grads, experienced, leadership.
ALTER TABLE recruiter_candidates ADD COLUMN hires TEXT;
-- JSON arrays: engineering, product_design, business, research, everything.
ALTER TABLE recruiter_candidates ADD COLUMN hires_for TEXT;
-- Null until the owner answers.
ALTER TABLE recruiter_candidates ADD COLUMN job TEXT
  CHECK (job IN ('recruiter', 'sourcer', 'coordinator', 'programs', 'leads', 'not_recruiting'));
-- Null until the owner answers; 1 for an outside firm or a fixed term.
ALTER TABLE recruiter_candidates ADD COLUMN agency INTEGER;

-- The single answer older labels gave, in the new terms.
UPDATE recruiter_candidates SET job = 'not_recruiting' WHERE actual_role = 'not_recruiter';
UPDATE recruiter_candidates SET job = 'recruiter', hires = '["interns","new_grads"]' WHERE actual_role = 'early_career';
UPDATE recruiter_candidates SET job = 'recruiter' WHERE actual_role = 'other_recruiter';
