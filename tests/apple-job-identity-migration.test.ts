import { Database } from "bun:sqlite";
import { describe, expect, it } from "bun:test";

const migrationDirectory = new URL("../migrations/", import.meta.url).pathname;

async function schemaBeforeAppleIdentityMigration() {
  const db = new Database(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  const files = (await Array.fromAsync(
    new Bun.Glob("*.sql").scan({ cwd: migrationDirectory })
  )).filter((file) => file < "0071_").sort();
  for (const file of files) {
    db.exec(await Bun.file(`${migrationDirectory}${file}`).text());
  }
  return db;
}

async function runMigration(db: Database) {
  const sql = await Bun.file(
    `${migrationDirectory}0071_apple_base_position_identity.sql`
  ).text();
  // bun:sqlite intentionally continues past an error in a multi-statement
  // exec. Run each migration statement separately so the CHECK guards exercise
  // the same abort-and-rollback behavior as D1 migrations.
  const statements = sql.replace(/--.*$/gm, "")
    .split(";").map((statement) => statement.trim()).filter(Boolean);
  db.transaction(() => {
    for (const statement of statements) db.exec(statement);
  })();
}

function seedPrincipals(db: Database) {
  db.exec(`
    UPDATE companies
    SET id = 'company-apple', enabled = 1
    WHERE source_type = 'apple' AND ats_slug = 'apple';

    INSERT INTO companies (
      id, name, ats_type, source_type, ats_slug, website, enabled
    ) VALUES
      ('company-other', 'Other', 'custom', 'amazon', 'other', 'example.com', 1);

    INSERT INTO users (id, name, role) VALUES
      ('user-1', 'One', 'admin'),
      ('user-2', 'Two', 'user');

    INSERT INTO push_subscriptions (
      id, endpoint, p256dh, auth, user_id, platform
    ) VALUES
      ('subscription-1', 'device-1', '', '', 'user-1', 'ios'),
      ('subscription-2', 'device-2', '', '', 'user-1', 'ios');
  `);
}

describe("Apple base-position identity migration", () => {
  it("idempotently preserves and repoints all job state before deleting siblings", async () => {
    const db = await schemaBeforeAppleIdentityMigration();
    seedPrincipals(db);
    db.exec(`
      INSERT INTO jobs (
        id, company_id, external_id, title, url, location, department,
        posted_at, first_seen_at, closed_at, description, salary,
        missed_polls, evergreen, dismissed, saved
      ) VALUES
        (
          'apple-old', 'company-apple', '2001-0836', 'iOS Engineer',
          'https://jobs.apple.com/en-us/details/2001-0836/ios-engineer',
          'Cupertino, United States', 'Software',
          '2026-08-01T10:00:00Z', '2026-08-02T10:00:00Z', NULL,
          'Short description', NULL, 0, 0, 0, 1
        ),
        (
          'apple-new', 'company-apple', '2001-0357', 'iOS Engineer',
          'https://jobs.apple.com/en-us/details/2001-0357/ios-engineer',
          'Austin, United States', 'Software and Services',
          '2026-08-01T10:00:00Z', '2026-08-02T11:00:00Z',
          '2026-08-20T00:00:00Z',
          'A materially longer and more complete description', '$100 - $200',
          2, 1, 1, 0
        ),
        (
          'apple-base', 'company-apple', '2002', 'Base role',
          'https://jobs.apple.com/en-us/details/2002/base-role',
          'New York, United States', 'Software', NULL,
          '2026-08-04T00:00:00Z', NULL, 'Base', NULL, 0, 0, 0, 0
        ),
        (
          'apple-base-sibling', 'company-apple', '2002-0836', 'Base role',
          'https://jobs.apple.com/en-us/details/2002-0836/base-role',
          'Boston, United States', 'Software', NULL,
          '2026-08-03T00:00:00Z', NULL, 'Sibling', NULL, 0, 0, 0, 0
        ),
        (
          'other-job', 'company-other', '2001-0836', 'Other role',
          'https://example.com/jobs/2001-0836', 'Chicago', 'Engineering', NULL,
          '2026-08-02T00:00:00Z', NULL, 'Unaffected', NULL, 0, 0, 0, 0
        );

      INSERT INTO saved_jobs (user_id, job_id, saved_at) VALUES
        ('user-1', 'apple-old', '2026-08-03T00:00:00Z'),
        ('user-1', 'apple-new', '2026-08-04T00:00:00Z');

      INSERT INTO dismissed_jobs (user_id, job_id, dismissed_at) VALUES
        ('user-1', 'apple-old', '2026-08-05T00:00:00Z'),
        ('user-1', 'apple-new', '2026-08-06T00:00:00Z'),
        ('user-2', 'apple-new', '2026-08-07T00:00:00Z');

      INSERT INTO viewed_jobs (user_id, job_id, viewed_at) VALUES
        ('user-1', 'apple-old', '2026-08-08T00:00:00Z'),
        ('user-1', 'apple-new', '2026-08-09T00:00:00Z');

      INSERT INTO applications (
        id, job_id, company_name, title, stage, next, url,
        created_at, updated_at, user_id
      ) VALUES
        (
          'application-old', 'apple-old', 'Apple', 'iOS Engineer', 'Applied', '',
          'https://jobs.apple.com/old', '2026-08-03T00:00:00Z',
          '2026-08-03T00:00:00Z', 'user-1'
        ),
        (
          'application-new', 'apple-new', 'Apple', 'iOS Engineer', 'Interview', 'Call',
          'https://jobs.apple.com/new', '2026-08-04T00:00:00Z',
          '2026-08-10T00:00:00Z', 'user-1'
        ),
        (
          'application-anonymous', 'apple-new', 'Apple', 'iOS Engineer', 'Applied', '',
          'https://jobs.apple.com/new', '2026-08-04T00:00:00Z',
          '2026-08-04T00:00:00Z', NULL
        );

      INSERT INTO user_job_matches (
        user_id, job_id, matcher_version, matched_at, updated_at
      ) VALUES
        ('user-1', 'apple-old', 'matcher-v1', '2026-08-03T00:00:00Z', '2026-08-04T00:00:00Z'),
        ('user-1', 'apple-new', 'matcher-v2', '2026-08-05T00:00:00Z', '2026-08-10T00:00:00Z'),
        ('user-2', 'apple-new', 'matcher-v2', '2026-08-06T00:00:00Z', '2026-08-11T00:00:00Z');

      INSERT INTO job_features (
        job_id, role_family, specialties_json, seniority, min_years, max_years,
        work_mode, countries_json, metro_areas_json, classifier_version,
        confidence, source_updated_at, classified_at,
        sponsorship_available, requires_advanced_degree,
        requires_security_clearance
      ) VALUES
        (
          'apple-old', 'software_engineering', '["ios"]', 'early_career', 1, 3,
          'onsite', '["US"]', '["Cupertino"]', 'features-v1', 0.8,
          '2026-08-03T00:00:00Z', '2026-08-04T00:00:00Z', 1, 0, 0
        ),
        (
          'apple-new', 'software_engineering', '["ios","backend"]', 'mid_level', 2, 5,
          'hybrid', '["US"]', '["Austin"]', 'features-v2', 0.95,
          '2026-08-09T00:00:00Z', '2026-08-10T00:00:00Z', 1, 0, 0
        );

      INSERT INTO job_review_queue (
        job_id, state, reason_codes_json, evidence_json, classifier_version,
        admin_note, reviewed_by, created_at, updated_at, reviewed_at
      ) VALUES
        (
          'apple-old', 'approved', '["manual"]', '{}', 'review-v1', 'Approved',
          'user-1', '2026-08-05T00:00:00Z', '2026-08-06T00:00:00Z',
          '2026-08-06T00:00:00Z'
        ),
        (
          'apple-new', 'needs_review', '["new"]', '{}', 'review-v2', NULL,
          NULL, '2026-08-07T00:00:00Z', '2026-08-08T00:00:00Z', NULL
        );

      INSERT INTO notification_match_backlog (job_id, queued_at) VALUES
        ('apple-old', '2026-08-05T00:00:00Z'),
        ('apple-new', '2026-08-06T00:00:00Z');

      INSERT INTO notification_candidates (
        id, user_id, job_id, channel, status, attempt_count, created_at,
        last_attempt_at, sent_at, opened_at
      ) VALUES
        (
          'candidate-old', 'user-1', 'apple-old', 'push', 'sent', 1,
          '2026-08-05T00:00:00Z', '2026-08-05T00:01:00Z',
          '2026-08-05T00:01:00Z', NULL
        ),
        (
          'candidate-new', 'user-1', 'apple-new', 'push', 'sent', 2,
          '2026-08-06T00:00:00Z', '2026-08-06T00:01:00Z',
          '2026-08-06T00:01:00Z', '2026-08-07T00:00:00Z'
        );

      INSERT INTO notification_deliveries (
        candidate_id, subscription_id, status, attempt_count,
        last_attempt_at, sent_at
      ) VALUES
        (
          'candidate-old', 'subscription-1', 'sent', 1,
          '2026-08-05T00:01:00Z', '2026-08-05T00:01:00Z'
        ),
        (
          'candidate-new', 'subscription-1', 'sent', 2,
          '2026-08-06T00:01:00Z', '2026-08-06T00:01:00Z'
        ),
        (
          'candidate-new', 'subscription-2', 'failed', 3,
          '2026-08-06T00:02:00Z', NULL
        );

      INSERT INTO content_reports (
        id, user_id, company_id, job_id, report_type, notes
      ) VALUES
        ('report-old', 'user-1', 'company-apple', 'apple-old', 'duplicate_listing', ''),
        ('report-new', 'user-1', 'company-apple', 'apple-new', 'incorrect_details', 'Location');

      INSERT INTO tailorings (
        id, user_id, job_id, status, job_snapshot_json, evidence_json,
        requirements_json, plan_json, model, template_version,
        compiler_version, created_at, updated_at
      ) VALUES
        (
          'tailoring-new', 'user-1', 'apple-new', 'planned', '{}', '{}', '[]', '{}',
          'model', 'template', 'compiler', '2026-08-08T00:00:00Z',
          '2026-08-08T00:00:00Z'
        );

      INSERT INTO tailoring_quality_events (
        id, tailoring_id, user_id, job_id, stage, outcome, created_at
      ) VALUES
        (
          'quality-new', 'tailoring-new', 'user-1', 'apple-new',
          'compile', 'success', '2026-08-08T00:00:00Z'
        );

      INSERT INTO product_events (
        id, user_id, event_name, entity_type, entity_id
      ) VALUES
        ('event-old', 'user-1', 'job_viewed', 'job', 'apple-old'),
        ('event-new', 'user-1', 'job_viewed', 'job', 'apple-new');

      INSERT INTO blocked_jobs (
        id, company_id, external_id, title, blocked_at
      ) VALUES
        ('block-old', 'company-apple', '3001-0836', 'Blocked old', '2026-08-01T00:00:00Z'),
        ('block-new', 'company-apple', '3001-0357', 'Blocked new', '2026-08-02T00:00:00Z');
    `);

    await runMigration(db);

    expect(db.query(`
      SELECT id, external_id, url, location, department, first_seen_at,
             closed_at, description, salary, missed_polls, evergreen,
             dismissed, saved
      FROM jobs WHERE company_id = 'company-apple' ORDER BY external_id
    `).all()).toEqual([
      {
        id: "apple-old",
        external_id: "2001",
        url: "https://jobs.apple.com/en-us/details/2001/ios-engineer",
        location: "Austin, United States / Cupertino, United States",
        department: "Software and Services",
        first_seen_at: "2026-08-02T10:00:00Z",
        closed_at: null,
        description: "A materially longer and more complete description",
        salary: "$100 - $200",
        missed_polls: 0,
        evergreen: 1,
        dismissed: 1,
        saved: 1,
      },
      {
        id: "apple-base",
        external_id: "2002",
        url: "https://jobs.apple.com/en-us/details/2002/base-role",
        location: "Boston, United States / New York, United States",
        department: "Software",
        first_seen_at: "2026-08-03T00:00:00Z",
        closed_at: null,
        description: "Sibling",
        salary: null,
        missed_polls: 0,
        evergreen: 0,
        dismissed: 0,
        saved: 0,
      },
    ]);
    expect(db.query("SELECT * FROM jobs WHERE id = 'other-job'").get()).not.toBeNull();
    expect(db.query(
      "SELECT alias_id, job_id FROM job_aliases ORDER BY alias_id"
    ).all()).toEqual([
      { alias_id: "apple-base-sibling", job_id: "apple-base" },
      { alias_id: "apple-new", job_id: "apple-old" },
    ]);

    expect(db.query("SELECT * FROM saved_jobs").all()).toEqual([{
      user_id: "user-1", job_id: "apple-old", saved_at: "2026-08-03T00:00:00Z",
    }]);
    expect(db.query("SELECT * FROM dismissed_jobs ORDER BY user_id").all()).toEqual([
      { user_id: "user-1", job_id: "apple-old", dismissed_at: "2026-08-05T00:00:00Z" },
      { user_id: "user-2", job_id: "apple-old", dismissed_at: "2026-08-07T00:00:00Z" },
    ]);
    expect(db.query("SELECT * FROM viewed_jobs").all()).toEqual([{
      user_id: "user-1", job_id: "apple-old", viewed_at: "2026-08-09T00:00:00Z",
    }]);

    expect(db.query(
      "SELECT id, job_id, stage FROM applications ORDER BY id"
    ).all()).toEqual([
      { id: "application-anonymous", job_id: "apple-old", stage: "Applied" },
      { id: "application-new", job_id: "apple-old", stage: "Interview" },
    ]);
    expect(db.query(`
      SELECT id, original_job_id, merged_into_job_id, stage
      FROM job_merge_application_archive
    `).get()).toEqual({
      id: "application-old",
      original_job_id: "apple-old",
      merged_into_job_id: "apple-old",
      stage: "Applied",
    });

    expect(db.query(`
      SELECT user_id, job_id, matcher_version, matched_at, updated_at
      FROM user_job_matches ORDER BY user_id
    `).all()).toEqual([
      {
        user_id: "user-1", job_id: "apple-old", matcher_version: "matcher-v2",
        matched_at: "2026-08-03T00:00:00Z", updated_at: "2026-08-10T00:00:00Z",
      },
      {
        user_id: "user-2", job_id: "apple-old", matcher_version: "matcher-v2",
        matched_at: "2026-08-06T00:00:00Z", updated_at: "2026-08-11T00:00:00Z",
      },
    ]);
    expect(db.query(`
      SELECT job_id, classifier_version, specialties_json, work_mode
      FROM job_features
    `).get()).toEqual({
      job_id: "apple-old",
      classifier_version: "features-v2",
      specialties_json: '["ios","backend"]',
      work_mode: "hybrid",
    });
    expect(db.query(`
      SELECT job_id, state, admin_note FROM job_review_queue
    `).get()).toEqual({ job_id: "apple-old", state: "approved", admin_note: "Approved" });
    expect(db.query("SELECT * FROM notification_match_backlog").all()).toEqual([{
      job_id: "apple-old", queued_at: "2026-08-05T00:00:00Z",
    }]);

    expect(db.query(`
      SELECT id, job_id, status, attempt_count, created_at, sent_at, opened_at
      FROM notification_candidates
    `).get()).toEqual({
      id: "candidate-new",
      job_id: "apple-old",
      status: "sent",
      attempt_count: 2,
      created_at: "2026-08-05T00:00:00Z",
      sent_at: "2026-08-05T00:01:00Z",
      opened_at: "2026-08-07T00:00:00Z",
    });
    expect(db.query(`
      SELECT candidate_id, subscription_id, status, attempt_count, sent_at
      FROM notification_deliveries ORDER BY subscription_id
    `).all()).toEqual([
      {
        candidate_id: "candidate-new", subscription_id: "subscription-1",
        status: "sent", attempt_count: 2, sent_at: "2026-08-05T00:01:00Z",
      },
      {
        candidate_id: "candidate-new", subscription_id: "subscription-2",
        status: "failed", attempt_count: 3, sent_at: null,
      },
    ]);

    for (const table of [
      "content_reports",
      "tailorings",
      "tailoring_quality_events",
    ]) {
      expect(db.query(`SELECT DISTINCT job_id FROM ${table}`).all())
        .toEqual([{ job_id: "apple-old" }]);
    }
    expect(db.query(`
      SELECT DISTINCT entity_id FROM product_events WHERE entity_type = 'job'
    `).all()).toEqual([{ entity_id: "apple-old" }]);
    expect(db.query(`
      SELECT id, external_id, blocked_at FROM blocked_jobs
    `).all()).toEqual([{
      id: "block-old", external_id: "3001", blocked_at: "2026-08-01T00:00:00Z",
    }]);
    expect(db.query("PRAGMA foreign_key_check").all()).toEqual([]);

    const countsBeforeSecondRun = db.query(`
      SELECT
        (SELECT COUNT(*) FROM jobs) AS jobs,
        (SELECT COUNT(*) FROM job_aliases) AS aliases,
        (SELECT COUNT(*) FROM applications) AS applications,
        (SELECT COUNT(*) FROM job_merge_application_archive) AS archived_applications,
        (SELECT COUNT(*) FROM notification_candidates) AS candidates,
        (SELECT COUNT(*) FROM notification_deliveries) AS deliveries
    `).get();
    await runMigration(db);
    expect(db.query(`
      SELECT
        (SELECT COUNT(*) FROM jobs) AS jobs,
        (SELECT COUNT(*) FROM job_aliases) AS aliases,
        (SELECT COUNT(*) FROM applications) AS applications,
        (SELECT COUNT(*) FROM job_merge_application_archive) AS archived_applications,
        (SELECT COUNT(*) FROM notification_candidates) AS candidates,
        (SELECT COUNT(*) FROM notification_deliveries) AS deliveries
    `).get()).toEqual(countsBeforeSecondRun);
    expect(db.query("PRAGMA foreign_key_check").all()).toEqual([]);
    expect(db.query(`
      SELECT name FROM sqlite_master
      WHERE type = 'table' AND name LIKE '_apple_%'
    `).all()).toEqual([]);
  });

  it("aborts atomically when sibling human review decisions conflict", async () => {
    const db = await schemaBeforeAppleIdentityMigration();
    seedPrincipals(db);
    db.exec(`
      INSERT INTO jobs (
        id, company_id, external_id, title, url, location, first_seen_at
      ) VALUES
        ('apple-approved', 'company-apple', '4001-0836', 'Role', 'https://jobs.apple.com/en-us/details/4001-0836/role', 'Austin', '2026-08-01T00:00:00Z'),
        ('apple-rejected', 'company-apple', '4001-0357', 'Role', 'https://jobs.apple.com/en-us/details/4001-0357/role', 'Cupertino', '2026-08-02T00:00:00Z');

      INSERT INTO job_review_queue (
        job_id, state, reason_codes_json, evidence_json, classifier_version,
        created_at, updated_at
      ) VALUES
        ('apple-approved', 'approved', '[]', '{}', 'review', '2026-08-01T00:00:00Z', '2026-08-01T00:00:00Z'),
        ('apple-rejected', 'rejected', '[]', '{}', 'review', '2026-08-02T00:00:00Z', '2026-08-02T00:00:00Z');
    `);

    await expect(runMigration(db)).rejects.toThrow("CHECK constraint failed");
    expect(db.query("SELECT id, external_id FROM jobs ORDER BY id").all()).toEqual([
      { id: "apple-approved", external_id: "4001-0836" },
      { id: "apple-rejected", external_id: "4001-0357" },
    ]);
    expect(db.query(`
      SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'job_aliases'
    `).get()).toBeNull();
  });
});
