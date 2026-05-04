INSERT INTO companies (id, name, ats_type, ats_slug, enabled, website)
VALUES ('test-company', 'Acme Corporation', 'custom', 'acme', 1, 'https://acme.example.com');

INSERT INTO jobs (id, company_id, external_id, title, url, location, department, posted_at, first_seen_at, score, dismissed)
VALUES
  ('test-001', 'test-company', 'test-ext-001', 'Software Engineer, Product', 'https://acme.example.com/jobs/001', 'San Francisco, CA', 'Engineering', datetime('now', '-6 hours'), datetime('now', '-6 hours'), 92, 0),
  ('test-002', 'test-company', 'test-ext-002', 'Forward Deployed Engineer', 'https://acme.example.com/jobs/002', 'New York, NY', 'Engineering', datetime('now', '-2 hours'), datetime('now', '-2 hours'), 88, 0),
  ('test-003', 'test-company', 'test-ext-003', 'Full Stack Engineer', 'https://acme.example.com/jobs/003', 'San Francisco, CA', 'Engineering', datetime('now', '-10 hours'), datetime('now', '-10 hours'), 85, 0),
  ('test-004', 'test-company', 'test-ext-004', 'Backend Engineer', 'https://acme.example.com/jobs/004', 'Remote', 'Engineering', datetime('now', '-1 day'), datetime('now', '-1 day'), 78, 0),
  ('test-005', 'test-company', 'test-ext-005', 'Software Engineer, Infra', 'https://acme.example.com/jobs/005', 'Remote', 'Engineering', datetime('now', '-3 hours'), datetime('now', '-3 hours'), 74, 0),
  ('test-006', 'test-company', 'test-ext-006', 'iOS Engineer', 'https://acme.example.com/jobs/006', 'New York, NY', 'Mobile', datetime('now', '-5 hours'), datetime('now', '-5 hours'), 65, 0),
  ('test-007', 'test-company', 'test-ext-007', 'Senior Data Engineer', 'https://acme.example.com/jobs/007', 'San Francisco, CA', 'Data', datetime('now', '-18 hours'), datetime('now', '-18 hours'), 45, 0),
  ('test-008', 'test-company', 'test-ext-008', 'Product Designer', 'https://acme.example.com/jobs/008', 'San Francisco, CA', 'Design', datetime('now', '-12 hours'), datetime('now', '-12 hours'), 22, 0);
