-- Apple emits one reqId per location (for example 200680561-0836 and
-- 200680561-0357), but positionId 200680561 is the durable public role. Merge
-- those historical siblings before the adapter begins persisting positionId.
--
-- Permanent aliases keep delivered notification/deep-link UUIDs resolvable.
CREATE TABLE IF NOT EXISTS job_aliases (
  alias_id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (alias_id <> job_id)
);

CREATE INDEX IF NOT EXISTS idx_job_aliases_job_id
  ON job_aliases(job_id);

-- A user can only have one live application per logical job. If two location
-- siblings both have applications, retain the newest one in applications and
-- preserve the other record here rather than destroying it.
CREATE TABLE IF NOT EXISTS job_merge_application_archive (
  id TEXT PRIMARY KEY,
  original_job_id TEXT NOT NULL,
  merged_into_job_id TEXT NOT NULL,
  company_name TEXT NOT NULL,
  title TEXT NOT NULL,
  stage TEXT NOT NULL,
  next TEXT NOT NULL,
  url TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  archived_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_job_merge_application_archive_user
  ON job_merge_application_archive(user_id);

DROP TABLE IF EXISTS _apple_job_merge_map;
CREATE TABLE _apple_job_merge_map (
  alias_job_id TEXT PRIMARY KEY,
  canonical_job_id TEXT NOT NULL,
  base_external_id TEXT NOT NULL
);

WITH normalized AS (
  SELECT
    j.id,
    j.company_id,
    j.external_id,
    j.first_seen_at,
    CASE
      WHEN substr(j.external_id, 1, 5) = 'PIPE-' THEN
        CASE
          WHEN instr(substr(j.external_id, 6), '-') > 0
            THEN substr(substr(j.external_id, 6), 1, instr(substr(j.external_id, 6), '-') - 1)
          ELSE substr(j.external_id, 6)
        END
      WHEN instr(j.external_id, '-') > 0
        THEN substr(j.external_id, 1, instr(j.external_id, '-') - 1)
      ELSE j.external_id
    END AS base_external_id
  FROM jobs j
  JOIN companies c ON c.id = j.company_id
  WHERE c.source_type = 'apple'
), ranked AS (
  SELECT
    id,
    base_external_id,
    FIRST_VALUE(id) OVER (
      PARTITION BY company_id, base_external_id
      ORDER BY
        CASE WHEN external_id = base_external_id THEN 0 ELSE 1 END,
        datetime(first_seen_at),
        id
    ) AS canonical_job_id
  FROM normalized
)
INSERT INTO _apple_job_merge_map (alias_job_id, canonical_job_id, base_external_id)
SELECT id, canonical_job_id, base_external_id
FROM ranked;

INSERT OR IGNORE INTO job_aliases (alias_id, job_id)
SELECT alias_job_id, canonical_job_id
FROM _apple_job_merge_map
WHERE alias_job_id <> canonical_job_id;

-- Consolidate the factual job record. Content and salary prefer the most
-- complete sibling; observation time is the earliest; a role remains open if
-- any sibling is open. URL and external_id are rewritten to Apple's base ID.
UPDATE jobs AS target
SET
  external_id = (
    SELECT base_external_id
    FROM _apple_job_merge_map
    WHERE canonical_job_id = target.id
    LIMIT 1
  ),
  url = replace(
    target.url,
    '/details/' || CASE
      WHEN substr(target.external_id, 1, 5) = 'PIPE-'
        THEN substr(target.external_id, 6)
      ELSE target.external_id
    END || '/',
    '/details/' || (
      SELECT base_external_id
      FROM _apple_job_merge_map
      WHERE canonical_job_id = target.id
      LIMIT 1
    ) || '/'
  ),
  location = COALESCE((
    SELECT group_concat(value, ' / ')
    FROM (
      SELECT DISTINCT trim(j2.location) AS value
      FROM jobs j2
      JOIN _apple_job_merge_map m2 ON m2.alias_job_id = j2.id
      WHERE m2.canonical_job_id = target.id
        AND trim(j2.location) <> ''
      ORDER BY value
    )
  ), target.location),
  department = COALESCE((
    SELECT j2.department
    FROM jobs j2
    JOIN _apple_job_merge_map m2 ON m2.alias_job_id = j2.id
    WHERE m2.canonical_job_id = target.id
      AND j2.department IS NOT NULL
      AND trim(j2.department) <> ''
    ORDER BY length(j2.department) DESC, datetime(j2.first_seen_at), j2.id
    LIMIT 1
  ), target.department),
  posted_at = (
    SELECT j2.posted_at
    FROM jobs j2
    JOIN _apple_job_merge_map m2 ON m2.alias_job_id = j2.id
    WHERE m2.canonical_job_id = target.id AND j2.posted_at IS NOT NULL
    ORDER BY datetime(j2.posted_at), j2.posted_at
    LIMIT 1
  ),
  first_seen_at = (
    SELECT j2.first_seen_at
    FROM jobs j2
    JOIN _apple_job_merge_map m2 ON m2.alias_job_id = j2.id
    WHERE m2.canonical_job_id = target.id
    ORDER BY datetime(j2.first_seen_at), j2.first_seen_at
    LIMIT 1
  ),
  dismissed = (
    SELECT MAX(j2.dismissed)
    FROM jobs j2
    JOIN _apple_job_merge_map m2 ON m2.alias_job_id = j2.id
    WHERE m2.canonical_job_id = target.id
  ),
  saved = (
    SELECT MAX(j2.saved)
    FROM jobs j2
    JOIN _apple_job_merge_map m2 ON m2.alias_job_id = j2.id
    WHERE m2.canonical_job_id = target.id
  ),
  closed_at = CASE
    WHEN EXISTS (
      SELECT 1
      FROM jobs j2
      JOIN _apple_job_merge_map m2 ON m2.alias_job_id = j2.id
      WHERE m2.canonical_job_id = target.id AND j2.closed_at IS NULL
    ) THEN NULL
    ELSE (
      SELECT MAX(j2.closed_at)
      FROM jobs j2
      JOIN _apple_job_merge_map m2 ON m2.alias_job_id = j2.id
      WHERE m2.canonical_job_id = target.id
    )
  END,
  description = COALESCE((
    SELECT j2.description
    FROM jobs j2
    JOIN _apple_job_merge_map m2 ON m2.alias_job_id = j2.id
    WHERE m2.canonical_job_id = target.id
      AND j2.description IS NOT NULL
      AND trim(j2.description) <> ''
    ORDER BY length(j2.description) DESC, datetime(j2.first_seen_at), j2.id
    LIMIT 1
  ), target.description),
  salary = COALESCE((
    SELECT j2.salary
    FROM jobs j2
    JOIN _apple_job_merge_map m2 ON m2.alias_job_id = j2.id
    WHERE m2.canonical_job_id = target.id
      AND j2.salary IS NOT NULL
      AND trim(j2.salary) <> ''
    ORDER BY length(j2.salary) DESC, datetime(j2.first_seen_at), j2.id
    LIMIT 1
  ), target.salary),
  missed_polls = (
    SELECT MIN(j2.missed_polls)
    FROM jobs j2
    JOIN _apple_job_merge_map m2 ON m2.alias_job_id = j2.id
    WHERE m2.canonical_job_id = target.id
  ),
  evergreen = (
    SELECT MAX(j2.evergreen)
    FROM jobs j2
    JOIN _apple_job_merge_map m2 ON m2.alias_job_id = j2.id
    WHERE m2.canonical_job_id = target.id
  )
WHERE target.id IN (
  SELECT canonical_job_id FROM _apple_job_merge_map
);

-- Merge per-user sets without losing their meaningful timestamps.
INSERT INTO saved_jobs (user_id, job_id, saved_at)
SELECT s.user_id, m.canonical_job_id, MIN(s.saved_at)
FROM saved_jobs s
JOIN _apple_job_merge_map m ON m.alias_job_id = s.job_id
GROUP BY s.user_id, m.canonical_job_id
ON CONFLICT(user_id, job_id) DO UPDATE SET
  saved_at = MIN(saved_jobs.saved_at, excluded.saved_at);

DELETE FROM saved_jobs
WHERE job_id IN (
  SELECT alias_job_id FROM _apple_job_merge_map WHERE alias_job_id <> canonical_job_id
);

INSERT INTO dismissed_jobs (user_id, job_id, dismissed_at)
SELECT d.user_id, m.canonical_job_id, MIN(d.dismissed_at)
FROM dismissed_jobs d
JOIN _apple_job_merge_map m ON m.alias_job_id = d.job_id
GROUP BY d.user_id, m.canonical_job_id
ON CONFLICT(user_id, job_id) DO UPDATE SET
  dismissed_at = MIN(dismissed_jobs.dismissed_at, excluded.dismissed_at);

DELETE FROM dismissed_jobs
WHERE job_id IN (
  SELECT alias_job_id FROM _apple_job_merge_map WHERE alias_job_id <> canonical_job_id
);

INSERT INTO viewed_jobs (user_id, job_id, viewed_at)
SELECT v.user_id, m.canonical_job_id, MAX(v.viewed_at)
FROM viewed_jobs v
JOIN _apple_job_merge_map m ON m.alias_job_id = v.job_id
GROUP BY v.user_id, m.canonical_job_id
ON CONFLICT(user_id, job_id) DO UPDATE SET
  viewed_at = MAX(viewed_jobs.viewed_at, excluded.viewed_at);

DELETE FROM viewed_jobs
WHERE job_id IN (
  SELECT alias_job_id FROM _apple_job_merge_map WHERE alias_job_id <> canonical_job_id
);

-- Preserve one live application per user/logical job and archive any duplicate
-- application row in full before it is removed from the constrained table.
DROP TABLE IF EXISTS _apple_application_merge;
CREATE TABLE _apple_application_merge AS
SELECT
  a.id AS application_id,
  a.job_id AS original_job_id,
  m.canonical_job_id,
  ROW_NUMBER() OVER (
    PARTITION BY a.user_id, m.canonical_job_id
    ORDER BY datetime(a.updated_at) DESC, datetime(a.created_at) DESC, a.id
  ) AS merge_rank
FROM applications a
JOIN _apple_job_merge_map m ON m.alias_job_id = a.job_id
WHERE a.user_id IS NOT NULL;

INSERT OR IGNORE INTO job_merge_application_archive (
  id, original_job_id, merged_into_job_id, company_name, title, stage,
  next, url, created_at, updated_at, user_id
)
SELECT
  a.id, am.original_job_id, am.canonical_job_id, a.company_name, a.title,
  a.stage, a.next, a.url, a.created_at, a.updated_at, a.user_id
FROM _apple_application_merge am
JOIN applications a ON a.id = am.application_id
WHERE am.merge_rank > 1;

DELETE FROM applications
WHERE id IN (
  SELECT application_id FROM _apple_application_merge WHERE merge_rank > 1
);

UPDATE applications AS a
SET job_id = (
  SELECT m.canonical_job_id
  FROM _apple_job_merge_map m
  WHERE m.alias_job_id = a.job_id
)
WHERE a.job_id IN (SELECT alias_job_id FROM _apple_job_merge_map);

DROP TABLE _apple_application_merge;

-- Keep the newest matcher version while retaining the first/last matching
-- timestamps across every location sibling.
DROP TABLE IF EXISTS _apple_match_merge;
CREATE TABLE _apple_match_merge AS
SELECT
  ujm.user_id,
  m.canonical_job_id,
  ujm.matcher_version,
  MIN(ujm.matched_at) OVER (
    PARTITION BY ujm.user_id, m.canonical_job_id
  ) AS matched_at,
  MAX(ujm.updated_at) OVER (
    PARTITION BY ujm.user_id, m.canonical_job_id
  ) AS updated_at,
  ROW_NUMBER() OVER (
    PARTITION BY ujm.user_id, m.canonical_job_id
    ORDER BY datetime(ujm.updated_at) DESC, datetime(ujm.matched_at) DESC, ujm.job_id
  ) AS merge_rank
FROM user_job_matches ujm
JOIN _apple_job_merge_map m ON m.alias_job_id = ujm.job_id;

INSERT INTO user_job_matches (
  user_id, job_id, matcher_version, matched_at, updated_at
)
SELECT user_id, canonical_job_id, matcher_version, matched_at, updated_at
FROM _apple_match_merge
WHERE merge_rank = 1
ON CONFLICT(user_id, job_id) DO UPDATE SET
  matcher_version = excluded.matcher_version,
  matched_at = excluded.matched_at,
  updated_at = excluded.updated_at;

DELETE FROM user_job_matches
WHERE job_id IN (
  SELECT alias_job_id FROM _apple_job_merge_map WHERE alias_job_id <> canonical_job_id
);

DROP TABLE _apple_match_merge;

-- A logical job has one classification. Prefer the most recently classified
-- sibling and copy its complete current feature schema to the survivor.
DROP TABLE IF EXISTS _apple_feature_merge;
CREATE TABLE _apple_feature_merge AS
SELECT
  m.canonical_job_id,
  jf.*,
  ROW_NUMBER() OVER (
    PARTITION BY m.canonical_job_id
    ORDER BY datetime(jf.classified_at) DESC,
             datetime(jf.source_updated_at) DESC,
             jf.confidence DESC,
             jf.job_id
  ) AS merge_rank
FROM job_features jf
JOIN _apple_job_merge_map m ON m.alias_job_id = jf.job_id;

INSERT INTO job_features (
  job_id, role_family, specialties_json, seniority, min_years, max_years,
  work_mode, countries_json, metro_areas_json, salary_min, salary_max,
  salary_currency, salary_period, classifier_version, confidence,
  source_updated_at, classified_at, sponsorship_available,
  requires_advanced_degree, requires_security_clearance
)
SELECT
  canonical_job_id, role_family, specialties_json, seniority, min_years,
  max_years, work_mode, countries_json, metro_areas_json, salary_min,
  salary_max, salary_currency, salary_period, classifier_version, confidence,
  source_updated_at, classified_at, sponsorship_available,
  requires_advanced_degree, requires_security_clearance
FROM _apple_feature_merge
WHERE merge_rank = 1
ON CONFLICT(job_id) DO UPDATE SET
  role_family = excluded.role_family,
  specialties_json = excluded.specialties_json,
  seniority = excluded.seniority,
  min_years = excluded.min_years,
  max_years = excluded.max_years,
  work_mode = excluded.work_mode,
  countries_json = excluded.countries_json,
  metro_areas_json = excluded.metro_areas_json,
  salary_min = excluded.salary_min,
  salary_max = excluded.salary_max,
  salary_currency = excluded.salary_currency,
  salary_period = excluded.salary_period,
  classifier_version = excluded.classifier_version,
  confidence = excluded.confidence,
  source_updated_at = excluded.source_updated_at,
  classified_at = excluded.classified_at,
  sponsorship_available = excluded.sponsorship_available,
  requires_advanced_degree = excluded.requires_advanced_degree,
  requires_security_clearance = excluded.requires_security_clearance;

DELETE FROM job_features
WHERE job_id IN (
  SELECT alias_job_id FROM _apple_job_merge_map WHERE alias_job_id <> canonical_job_id
);

DROP TABLE _apple_feature_merge;

-- Human review outcomes cannot be combined honestly if one sibling was
-- approved and another rejected. Abort atomically in that unexpected case.
DROP TABLE IF EXISTS _apple_review_guard;
CREATE TABLE _apple_review_guard (
  ok INTEGER NOT NULL CHECK (ok = 1)
);

INSERT INTO _apple_review_guard (ok)
SELECT 0
FROM job_review_queue r
JOIN _apple_job_merge_map m ON m.alias_job_id = r.job_id
GROUP BY m.canonical_job_id
HAVING MAX(CASE WHEN r.state = 'approved' THEN 1 ELSE 0 END) = 1
   AND MAX(CASE WHEN r.state = 'rejected' THEN 1 ELSE 0 END) = 1;

DROP TABLE IF EXISTS _apple_review_merge;
CREATE TABLE _apple_review_merge AS
SELECT
  m.canonical_job_id,
  r.*,
  ROW_NUMBER() OVER (
    PARTITION BY m.canonical_job_id
    ORDER BY CASE WHEN r.state = 'needs_review' THEN 1 ELSE 0 END,
             datetime(r.reviewed_at) DESC,
             datetime(r.updated_at) DESC,
             r.job_id
  ) AS merge_rank
FROM job_review_queue r
JOIN _apple_job_merge_map m ON m.alias_job_id = r.job_id;

INSERT INTO job_review_queue (
  job_id, state, reason_codes_json, evidence_json, classifier_version,
  admin_note, reviewed_by, created_at, updated_at, reviewed_at
)
SELECT
  canonical_job_id, state, reason_codes_json, evidence_json,
  classifier_version, admin_note, reviewed_by, created_at, updated_at,
  reviewed_at
FROM _apple_review_merge
WHERE merge_rank = 1
ON CONFLICT(job_id) DO UPDATE SET
  state = excluded.state,
  reason_codes_json = excluded.reason_codes_json,
  evidence_json = excluded.evidence_json,
  classifier_version = excluded.classifier_version,
  admin_note = excluded.admin_note,
  reviewed_by = excluded.reviewed_by,
  created_at = excluded.created_at,
  updated_at = excluded.updated_at,
  reviewed_at = excluded.reviewed_at;

DELETE FROM job_review_queue
WHERE job_id IN (
  SELECT alias_job_id FROM _apple_job_merge_map WHERE alias_job_id <> canonical_job_id
);

DROP TABLE _apple_review_merge;
DROP TABLE _apple_review_guard;

INSERT INTO notification_match_backlog (job_id, queued_at)
SELECT m.canonical_job_id, MIN(b.queued_at)
FROM notification_match_backlog b
JOIN _apple_job_merge_map m ON m.alias_job_id = b.job_id
GROUP BY m.canonical_job_id
ON CONFLICT(job_id) DO UPDATE SET
  queued_at = MIN(notification_match_backlog.queued_at, excluded.queued_at);

DELETE FROM notification_match_backlog
WHERE job_id IN (
  SELECT alias_job_id FROM _apple_job_merge_map WHERE alias_job_id <> canonical_job_id
);

-- Candidate IDs are delivery foreign keys, so select one durable candidate per
-- user/logical-job/channel, aggregate its state, remap all subscription
-- deliveries, and only then remove colliding candidates.
DROP TABLE IF EXISTS _apple_candidate_map;
CREATE TABLE _apple_candidate_map AS
SELECT
  nc.id AS candidate_id,
  m.canonical_job_id,
  FIRST_VALUE(nc.id) OVER (
    PARTITION BY nc.user_id, m.canonical_job_id, nc.channel
    ORDER BY CASE
      WHEN nc.opened_at IS NOT NULL THEN 0
      WHEN nc.status = 'sent' THEN 1
      WHEN nc.status = 'sending' THEN 2
      WHEN nc.status = 'retry' THEN 3
      WHEN nc.status = 'pending' THEN 4
      WHEN nc.status = 'failed' THEN 5
      ELSE 6
    END,
    datetime(nc.created_at),
    nc.id
  ) AS winner_candidate_id
FROM notification_candidates nc
JOIN _apple_job_merge_map m ON m.alias_job_id = nc.job_id;

DROP TABLE IF EXISTS _apple_candidate_merge;
CREATE TABLE _apple_candidate_merge AS
SELECT
  cm.winner_candidate_id,
  cm.canonical_job_id,
  CASE
    WHEN MAX(CASE WHEN nc.opened_at IS NOT NULL OR nc.status = 'sent' THEN 1 ELSE 0 END) = 1
      THEN 'sent'
    WHEN MAX(CASE WHEN nc.status IN ('sending', 'retry') THEN 1 ELSE 0 END) = 1
      THEN 'retry'
    WHEN MAX(CASE WHEN nc.status = 'pending' THEN 1 ELSE 0 END) = 1
      THEN 'pending'
    WHEN MAX(CASE WHEN nc.status = 'failed' THEN 1 ELSE 0 END) = 1
      THEN 'failed'
    ELSE 'skipped'
  END AS status,
  MAX(nc.attempt_count) AS attempt_count,
  CASE
    WHEN MAX(CASE WHEN nc.opened_at IS NOT NULL OR nc.status = 'sent' THEN 1 ELSE 0 END) = 1
      THEN NULL
    ELSE MAX(nc.last_error)
  END AS last_error,
  MIN(nc.created_at) AS created_at,
  MAX(nc.last_attempt_at) AS last_attempt_at,
  MIN(nc.sent_at) AS sent_at,
  MAX(nc.opened_at) AS opened_at
FROM _apple_candidate_map cm
JOIN notification_candidates nc ON nc.id = cm.candidate_id
GROUP BY cm.winner_candidate_id, cm.canonical_job_id;

DROP TABLE IF EXISTS _apple_delivery_merge;
CREATE TABLE _apple_delivery_merge AS
SELECT
  cm.winner_candidate_id AS candidate_id,
  nd.subscription_id,
  CASE
    WHEN MAX(CASE WHEN nd.status = 'sent' THEN 1 ELSE 0 END) = 1 THEN 'sent'
    WHEN MAX(CASE WHEN nd.status IN ('sending', 'retry') THEN 1 ELSE 0 END) = 1 THEN 'retry'
    WHEN MAX(CASE WHEN nd.status = 'pending' THEN 1 ELSE 0 END) = 1 THEN 'pending'
    ELSE 'failed'
  END AS status,
  MAX(nd.attempt_count) AS attempt_count,
  CASE
    WHEN MAX(CASE WHEN nd.status = 'sent' THEN 1 ELSE 0 END) = 1 THEN NULL
    ELSE MAX(nd.last_error)
  END AS last_error,
  MAX(nd.last_attempt_at) AS last_attempt_at,
  MIN(nd.sent_at) AS sent_at
FROM notification_deliveries nd
JOIN _apple_candidate_map cm ON cm.candidate_id = nd.candidate_id
GROUP BY cm.winner_candidate_id, nd.subscription_id;

DELETE FROM notification_deliveries
WHERE candidate_id IN (SELECT candidate_id FROM _apple_candidate_map);

DELETE FROM notification_candidates
WHERE id IN (
  SELECT candidate_id
  FROM _apple_candidate_map
  WHERE candidate_id <> winner_candidate_id
);

UPDATE notification_candidates AS nc
SET
  job_id = (
    SELECT canonical_job_id
    FROM _apple_candidate_merge
    WHERE winner_candidate_id = nc.id
  ),
  status = (
    SELECT status FROM _apple_candidate_merge WHERE winner_candidate_id = nc.id
  ),
  attempt_count = (
    SELECT attempt_count FROM _apple_candidate_merge WHERE winner_candidate_id = nc.id
  ),
  last_error = (
    SELECT last_error FROM _apple_candidate_merge WHERE winner_candidate_id = nc.id
  ),
  created_at = (
    SELECT created_at FROM _apple_candidate_merge WHERE winner_candidate_id = nc.id
  ),
  last_attempt_at = (
    SELECT last_attempt_at FROM _apple_candidate_merge WHERE winner_candidate_id = nc.id
  ),
  sent_at = (
    SELECT sent_at FROM _apple_candidate_merge WHERE winner_candidate_id = nc.id
  ),
  opened_at = (
    SELECT opened_at FROM _apple_candidate_merge WHERE winner_candidate_id = nc.id
  )
WHERE nc.id IN (SELECT winner_candidate_id FROM _apple_candidate_merge);

INSERT INTO notification_deliveries (
  candidate_id, subscription_id, status, attempt_count, last_error,
  last_attempt_at, sent_at
)
SELECT
  candidate_id, subscription_id, status, attempt_count, last_error,
  last_attempt_at, sent_at
FROM _apple_delivery_merge;

DROP TABLE _apple_delivery_merge;
DROP TABLE _apple_candidate_merge;
DROP TABLE _apple_candidate_map;

-- Direct, unconstrained child records can be repointed without collapsing.
UPDATE content_reports AS cr
SET job_id = (
  SELECT canonical_job_id FROM _apple_job_merge_map WHERE alias_job_id = cr.job_id
)
WHERE cr.job_id IN (SELECT alias_job_id FROM _apple_job_merge_map);

UPDATE tailorings AS t
SET job_id = (
  SELECT canonical_job_id FROM _apple_job_merge_map WHERE alias_job_id = t.job_id
)
WHERE t.job_id IN (SELECT alias_job_id FROM _apple_job_merge_map);

UPDATE tailoring_quality_events AS tqe
SET job_id = (
  SELECT canonical_job_id FROM _apple_job_merge_map WHERE alias_job_id = tqe.job_id
)
WHERE tqe.job_id IN (SELECT alias_job_id FROM _apple_job_merge_map);

UPDATE product_events AS pe
SET entity_id = (
  SELECT canonical_job_id FROM _apple_job_merge_map WHERE alias_job_id = pe.entity_id
)
WHERE pe.entity_type = 'job'
  AND pe.entity_id IN (SELECT alias_job_id FROM _apple_job_merge_map);

-- Refuse to rely on ON DELETE cascades for a table this migration forgot. This
-- guard enumerates every current job foreign key in the production schema.
DROP TABLE IF EXISTS _apple_reference_guard;
CREATE TABLE _apple_reference_guard (
  ok INTEGER NOT NULL CHECK (ok = 1)
);

INSERT INTO _apple_reference_guard (ok)
SELECT 0
WHERE EXISTS (
  SELECT 1
  FROM _apple_job_merge_map m
  WHERE m.alias_job_id <> m.canonical_job_id
    AND (
      EXISTS (SELECT 1 FROM applications x WHERE x.job_id = m.alias_job_id)
      OR EXISTS (SELECT 1 FROM content_reports x WHERE x.job_id = m.alias_job_id)
      OR EXISTS (SELECT 1 FROM dismissed_jobs x WHERE x.job_id = m.alias_job_id)
      OR EXISTS (SELECT 1 FROM job_features x WHERE x.job_id = m.alias_job_id)
      OR EXISTS (SELECT 1 FROM job_review_queue x WHERE x.job_id = m.alias_job_id)
      OR EXISTS (SELECT 1 FROM notification_candidates x WHERE x.job_id = m.alias_job_id)
      OR EXISTS (SELECT 1 FROM notification_match_backlog x WHERE x.job_id = m.alias_job_id)
      OR EXISTS (SELECT 1 FROM saved_jobs x WHERE x.job_id = m.alias_job_id)
      OR EXISTS (SELECT 1 FROM tailoring_quality_events x WHERE x.job_id = m.alias_job_id)
      OR EXISTS (SELECT 1 FROM tailorings x WHERE x.job_id = m.alias_job_id)
      OR EXISTS (SELECT 1 FROM user_job_matches x WHERE x.job_id = m.alias_job_id)
      OR EXISTS (SELECT 1 FROM viewed_jobs x WHERE x.job_id = m.alias_job_id)
    )
);

DELETE FROM jobs
WHERE id IN (
  SELECT alias_job_id FROM _apple_job_merge_map WHERE alias_job_id <> canonical_job_id
);

DROP TABLE _apple_reference_guard;

-- Global block records key on company/external_id rather than job UUID. Merge
-- those too so a blocked location sibling cannot return under the base ID.
DROP TABLE IF EXISTS _apple_blocked_merge;
CREATE TABLE _apple_blocked_merge AS
WITH normalized AS (
  SELECT
    b.*,
    CASE
      WHEN substr(b.external_id, 1, 5) = 'PIPE-' THEN
        CASE
          WHEN instr(substr(b.external_id, 6), '-') > 0
            THEN substr(substr(b.external_id, 6), 1, instr(substr(b.external_id, 6), '-') - 1)
          ELSE substr(b.external_id, 6)
        END
      WHEN instr(b.external_id, '-') > 0
        THEN substr(b.external_id, 1, instr(b.external_id, '-') - 1)
      ELSE b.external_id
    END AS base_external_id
  FROM blocked_jobs b
  JOIN companies c ON c.id = b.company_id
  WHERE c.source_type = 'apple'
)
SELECT
  id AS blocked_id,
  base_external_id,
  FIRST_VALUE(id) OVER (
    PARTITION BY company_id, base_external_id
    ORDER BY CASE WHEN external_id = base_external_id THEN 0 ELSE 1 END,
             datetime(blocked_at),
             id
  ) AS canonical_blocked_id
FROM normalized;

UPDATE blocked_jobs AS target
SET
  external_id = (
    SELECT base_external_id
    FROM _apple_blocked_merge
    WHERE canonical_blocked_id = target.id
    LIMIT 1
  ),
  blocked_at = (
    SELECT MIN(b.blocked_at)
    FROM blocked_jobs b
    JOIN _apple_blocked_merge bm ON bm.blocked_id = b.id
    WHERE bm.canonical_blocked_id = target.id
  ),
  title = COALESCE((
    SELECT b.title
    FROM blocked_jobs b
    JOIN _apple_blocked_merge bm ON bm.blocked_id = b.id
    WHERE bm.canonical_blocked_id = target.id
      AND b.title IS NOT NULL
      AND trim(b.title) <> ''
    ORDER BY datetime(b.blocked_at) DESC, b.id
    LIMIT 1
  ), target.title)
WHERE target.id IN (SELECT canonical_blocked_id FROM _apple_blocked_merge);

DELETE FROM blocked_jobs
WHERE id IN (
  SELECT blocked_id
  FROM _apple_blocked_merge
  WHERE blocked_id <> canonical_blocked_id
);

DROP TABLE _apple_blocked_merge;
DROP TABLE _apple_job_merge_map;
