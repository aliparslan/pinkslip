-- Pinkslip is still pre-launch, so this is an intentional hard cut to the
-- canonical resume/tailoring contract. Existing profile content is converted
-- once; dormant Markdown/corpus/upload records are not carried forward.

UPDATE user_profiles
SET data = json_set(
  data,
  '$.schemaVersion',
  2,
  '$.education',
  json(COALESCE((
    SELECT json_group_array(json(entry_v2))
    FROM (
      SELECT json_object(
        'id', COALESCE(NULLIF(trim(json_extract(entry.value, '$.id')), ''), 'education-' || entry.key),
        'institution', COALESCE(json_extract(entry.value, '$.institution'), ''),
        'credentials', json_array(
          json_object(
            'id', COALESCE(NULLIF(trim(json_extract(entry.value, '$.id')), ''), 'education-' || entry.key) || '-credential',
            'degreeType', COALESCE(
              NULLIF(trim(json_extract(entry.value, '$.degreeType')), ''),
              CASE
                WHEN lower(COALESCE(json_extract(entry.value, '$.degree'), '')) LIKE '%high school%' THEN 'high_school'
                WHEN lower(COALESCE(json_extract(entry.value, '$.degree'), '')) LIKE '%associate%' THEN 'associate'
                WHEN lower(COALESCE(json_extract(entry.value, '$.degree'), '')) LIKE '%bachelor%' THEN 'bachelor'
                WHEN lower(COALESCE(json_extract(entry.value, '$.degree'), '')) LIKE '%master%' THEN 'master'
                WHEN lower(COALESCE(json_extract(entry.value, '$.degree'), '')) LIKE '%doctor%' THEN 'doctorate'
                WHEN lower(COALESCE(json_extract(entry.value, '$.degree'), '')) LIKE '%certificate%' THEN 'certificate'
                ELSE 'other'
              END
            ),
            'fieldsOfStudy', CASE
              WHEN trim(COALESCE(json_extract(entry.value, '$.fieldOfStudy'), '')) <> ''
                THEN json_array(trim(json_extract(entry.value, '$.fieldOfStudy')))
              WHEN instr(COALESCE(json_extract(entry.value, '$.degree'), ''), ',') > 0
                THEN json_array(trim(substr(
                  json_extract(entry.value, '$.degree'),
                  instr(json_extract(entry.value, '$.degree'), ',') + 1
                )))
              ELSE json_array()
            END
          )
        ),
        'minors', CASE
          WHEN json_type(entry.value, '$.minors') = 'array'
            THEN json(json_extract(entry.value, '$.minors'))
          ELSE json_array()
        END,
        'location', COALESCE(json_extract(entry.value, '$.location'), ''),
        'startDate', COALESCE(json_extract(entry.value, '$.startDate'), ''),
        'endDate', COALESCE(json_extract(entry.value, '$.endDate'), ''),
        'gpa', json_extract(entry.value, '$.gpa')
      ) AS entry_v2
      FROM json_each(user_profiles.data, '$.education') AS entry
      WHERE json_type(entry.value) = 'object'
    )
  ), '[]'))
)
WHERE COALESCE(json_extract(data, '$.schemaVersion'), 1) <> 2;

DROP TABLE IF EXISTS tailored_resume_artifacts;
DROP TABLE IF EXISTS tailorings;
DROP TABLE IF EXISTS corpus_versions;
DROP TABLE IF EXISTS resume_assets;
DROP TABLE IF EXISTS tailor_usage;

CREATE TABLE tailor_usage (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  model TEXT NOT NULL,
  created_at TEXT NOT NULL,
  input_tokens INTEGER,
  output_tokens INTEGER,
  provider_units REAL
);

CREATE INDEX idx_tailor_usage_model_created
  ON tailor_usage(model, created_at);

CREATE INDEX idx_tailor_usage_user_created
  ON tailor_usage(user_id, created_at);

CREATE TABLE tailorings (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('planned', 'generated', 'failed')),
  job_snapshot_json TEXT NOT NULL,
  evidence_json TEXT NOT NULL,
  requirements_json TEXT NOT NULL,
  plan_json TEXT NOT NULL,
  resume_draft_json TEXT,
  validation_json TEXT,
  input_tokens INTEGER,
  output_tokens INTEGER,
  model TEXT NOT NULL,
  template_version TEXT NOT NULL,
  compiler_version TEXT NOT NULL,
  usage_id TEXT REFERENCES tailor_usage(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_tailorings_user_job_created
  ON tailorings(user_id, job_id, created_at DESC);

CREATE TABLE tailored_resume_artifacts (
  id TEXT PRIMARY KEY,
  tailoring_id TEXT NOT NULL REFERENCES tailorings(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL,
  resume_json TEXT NOT NULL,
  validation_json TEXT NOT NULL,
  typst_source TEXT NOT NULL,
  template_version TEXT NOT NULL,
  compiler_version TEXT NOT NULL,
  pdf_storage_key TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(tailoring_id, revision)
);

CREATE INDEX idx_tailored_resume_artifacts_tailoring_revision
  ON tailored_resume_artifacts(tailoring_id, revision DESC);

CREATE INDEX idx_tailored_resume_artifacts_user_created
  ON tailored_resume_artifacts(user_id, created_at DESC);
