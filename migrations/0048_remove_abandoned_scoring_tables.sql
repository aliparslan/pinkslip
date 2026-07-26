-- The profile matcher is now a single deterministic path. These tables belonged
-- to the disabled shadow scorer or to the original single-user application and
-- have no remaining readers or writers.
DROP TABLE IF EXISTS scorer_audits;
DROP TABLE IF EXISTS scorer_rollouts;
DROP TABLE IF EXISTS user_job_scores;
DROP TABLE IF EXISTS profile;
