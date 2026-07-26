-- The only configured rollout has been in 100% shadow mode, so every plausible
-- match writes a duplicate scorer_audits row even though no product surface or
-- decision consumes the experiment. Disable it before rebuilding cached scores
-- for the narrowed audience; the tables remain intact for historical analysis.
UPDATE scorer_rollouts
SET mode = 'off', cohort_percent = 0
WHERE mode != 'off';
