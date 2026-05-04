CREATE TABLE IF NOT EXISTS d1_migrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE,
  applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

INSERT OR IGNORE INTO d1_migrations (name) VALUES
  ('0001_initial.sql'),
  ('0002_seed_companies.sql'),
  ('0004_saved_apps_events.sql'),
  ('0005_users.sql'),
  ('0006_score_breakdown.sql'),
  ('0007_poll_status.sql'),
  ('0008_closed_and_blocked.sql'),
  ('0009_rescore_stale_jobs.sql'),
  ('0010_update_locations.sql'),
  ('0011_job_description.sql'),
  ('0012_unique_push_endpoint.sql'),
  ('0013_score_breakdown_columns.sql');
