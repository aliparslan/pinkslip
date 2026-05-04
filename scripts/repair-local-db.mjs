import { Database } from "bun:sqlite";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const DB_DIR = join(process.cwd(), ".wrangler", "state", "v3", "d1", "miniflare-D1DatabaseObject");
const CURRENT_MIGRATIONS = [
  "0001_initial.sql",
  "0002_seed_companies.sql",
  "0004_saved_apps_events.sql",
  "0005_users.sql",
  "0006_score_breakdown.sql",
  "0007_poll_status.sql",
  "0008_closed_and_blocked.sql",
  "0009_rescore_stale_jobs.sql",
  "0010_update_locations.sql",
  "0011_job_description.sql",
  "0012_unique_push_endpoint.sql",
  "0013_score_breakdown_columns.sql",
  "0014_shared_access_and_dismissals.sql",
  "0015_normalize_notify_threshold.sql",
  "0016_corpus_tailor_fetch_runs.sql",
  "0017_seed_hygiene.sql",
  "0018_disable_verified_broken_sources.sql",
];

if (!existsSync(DB_DIR)) {
  console.log("No local D1 state found. Skipping repair.");
  process.exit(0);
}

const sqliteFiles = readdirSync(DB_DIR)
  .filter((name) => name.endsWith(".sqlite") && name !== "metadata.sqlite")
  .map((name) => join(DB_DIR, name));

if (sqliteFiles.length === 0) {
  console.log("No local D1 databases found. Skipping repair.");
  process.exit(0);
}

function tableExists(db, tableName) {
  return Boolean(
    db.query("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1")
      .get(tableName)
  );
}

function indexExists(db, indexName) {
  return Boolean(
    db.query("SELECT 1 FROM sqlite_master WHERE type = 'index' AND name = ? LIMIT 1")
      .get(indexName)
  );
}

function getColumns(db, tableName) {
  if (!tableExists(db, tableName)) return [];
  return db.query(`PRAGMA table_info(${tableName})`).all().map((row) => row.name);
}

function columnExists(db, tableName, columnName) {
  return getColumns(db, tableName).includes(columnName);
}

function ensureTable(db, tableName, createSql, changes) {
  if (!tableExists(db, tableName)) {
    db.exec(createSql);
    changes.push(`created table ${tableName}`);
  }
}

function ensureIndex(db, indexName, createSql, changes) {
  if (!indexExists(db, indexName)) {
    db.exec(createSql);
    changes.push(`created index ${indexName}`);
  }
}

function ensureColumn(db, tableName, columnName, columnSql, changes) {
  if (!columnExists(db, tableName, columnName)) {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnSql}`);
    changes.push(`added ${tableName}.${columnName}`);
  }
}

function ensureUsers(db, changes) {
  ensureTable(
    db,
    "users",
    `CREATE TABLE users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    changes
  );

  const existing = db.query("SELECT id FROM users ORDER BY created_at ASC LIMIT 1").get();
  const userId = existing?.id ?? "local-migrated-user";
  db.query(
    "INSERT OR IGNORE INTO users (id, name, created_at) VALUES (?, ?, datetime('now'))"
  ).run(userId, existing?.id ? "" : "Local migrated user");
  return userId;
}

function ensureSavedJobs(db, migrationUserId, changes) {
  if (!tableExists(db, "saved_jobs")) {
    db.exec(`CREATE TABLE saved_jobs (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
      saved_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (user_id, job_id)
    )`);
    changes.push("created table saved_jobs");
    return;
  }

  if (!columnExists(db, "saved_jobs", "user_id")) {
    db.exec(`
      ALTER TABLE saved_jobs RENAME TO saved_jobs_legacy;
      CREATE TABLE saved_jobs (
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
        saved_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (user_id, job_id)
      );
      INSERT OR IGNORE INTO saved_jobs (user_id, job_id, saved_at)
      SELECT '${migrationUserId}', job_id, COALESCE(saved_at, datetime('now'))
      FROM saved_jobs_legacy;
      DROP TABLE saved_jobs_legacy;
    `);
    changes.push("migrated saved_jobs to user-scoped schema");
  }
}

function ensureApplications(db, migrationUserId, changes) {
  ensureTable(
    db,
    "applications",
    `CREATE TABLE applications (
      id TEXT PRIMARY KEY,
      job_id TEXT REFERENCES jobs(id) ON DELETE SET NULL,
      company_name TEXT NOT NULL,
      title TEXT NOT NULL,
      stage TEXT NOT NULL DEFAULT 'Applied' CHECK (stage IN ('Applied', 'Screen', 'Interview', 'Offer', 'Rejected', 'Ghosted')),
      next TEXT NOT NULL DEFAULT '',
      url TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      user_id TEXT REFERENCES users(id) ON DELETE CASCADE
    )`,
    changes
  );
  ensureColumn(db, "applications", "user_id", "TEXT REFERENCES users(id) ON DELETE CASCADE", changes);
  if (columnExists(db, "applications", "user_id")) {
    db.query("UPDATE applications SET user_id = ? WHERE user_id IS NULL OR user_id = ''").run(migrationUserId);
  }
}

function ensureEvents(db, changes) {
  ensureTable(
    db,
    "events",
    `CREATE TABLE events (
      id TEXT PRIMARY KEY,
      company_id TEXT REFERENCES companies(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      event_type TEXT NOT NULL DEFAULT 'other' CHECK (event_type IN ('career_fair', 'info_session', 'workshop', 'networking', 'other')),
      event_date TEXT NOT NULL,
      location TEXT NOT NULL DEFAULT '',
      url TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    changes
  );
  ensureIndex(db, "idx_events_date", "CREATE INDEX idx_events_date ON events(event_date)", changes);
  ensureIndex(db, "idx_events_company", "CREATE INDEX idx_events_company ON events(company_id)", changes);
}

function ensureCompanyColumns(db, changes) {
  ensureColumn(db, "companies", "last_poll_status", "TEXT", changes);
  ensureColumn(db, "companies", "last_poll_error", "TEXT", changes);
  ensureColumn(db, "companies", "last_polled_at", "TEXT", changes);
}

function ensureJobColumns(db, changes) {
  ensureColumn(db, "jobs", "saved", "INTEGER NOT NULL DEFAULT 0", changes);
  ensureColumn(db, "jobs", "closed_at", "TEXT", changes);
  ensureColumn(db, "jobs", "description", "TEXT", changes);
  ensureColumn(db, "jobs", "salary", "TEXT", changes);
  ensureColumn(db, "jobs", "title_score", "INTEGER NOT NULL DEFAULT 0", changes);
  ensureColumn(db, "jobs", "yoe_score", "INTEGER NOT NULL DEFAULT 0", changes);
  ensureColumn(db, "jobs", "location_score", "INTEGER NOT NULL DEFAULT 0", changes);
  ensureColumn(db, "jobs", "department_score", "INTEGER NOT NULL DEFAULT 0", changes);
  ensureColumn(db, "jobs", "recency_score", "INTEGER NOT NULL DEFAULT 0", changes);

  ensureIndex(db, "idx_jobs_score", "CREATE INDEX idx_jobs_score ON jobs(score DESC)", changes);
  ensureIndex(db, "idx_jobs_first_seen", "CREATE INDEX idx_jobs_first_seen ON jobs(first_seen_at DESC)", changes);
  ensureIndex(db, "idx_jobs_company", "CREATE INDEX idx_jobs_company ON jobs(company_id)", changes);
}

function ensureDismissedJobs(db, migrationUserId, changes) {
  ensureTable(
    db,
    "dismissed_jobs",
    `CREATE TABLE dismissed_jobs (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
      dismissed_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (user_id, job_id)
    )`,
    changes
  );

  if (columnExists(db, "jobs", "dismissed")) {
    const before = db.query("SELECT COUNT(*) AS count FROM jobs WHERE dismissed = 1").get()?.count ?? 0;
    if (before > 0) {
      db.query(
        `INSERT OR IGNORE INTO dismissed_jobs (user_id, job_id, dismissed_at)
         SELECT ?, id, datetime('now')
         FROM jobs
         WHERE dismissed = 1`
      ).run(migrationUserId);
      db.exec("UPDATE jobs SET dismissed = 0 WHERE dismissed = 1");
      changes.push(`migrated ${before} legacy dismissed job(s)`);
    }
  }
}

function ensureBlockedJobs(db, changes) {
  ensureTable(
    db,
    "blocked_jobs",
    `CREATE TABLE blocked_jobs (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      external_id TEXT NOT NULL,
      title TEXT,
      blocked_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(company_id, external_id)
    )`,
    changes
  );
}

function ensurePushIndex(db, changes) {
  ensureIndex(
    db,
    "idx_push_endpoint",
    "CREATE UNIQUE INDEX idx_push_endpoint ON push_subscriptions(endpoint)",
    changes
  );
}

function ensureCorpusAndTailor(db, changes) {
  ensureTable(
    db,
    "corpus_versions",
    `CREATE TABLE corpus_versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      content_md TEXT NOT NULL,
      label TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    changes
  );

  const corpusCount = db.query("SELECT COUNT(*) AS count FROM corpus_versions").get()?.count ?? 0;
  if (corpusCount === 0) {
    db.query(
      `INSERT INTO corpus_versions (content_md, label)
       VALUES (?, 'starter corpus')`
    ).run(`# Core profile

## Target roles
- Software engineer roles with strong product or infrastructure ownership
- Early-career to mid-level roles where breadth, speed, and curiosity matter

## Top skills
- TypeScript, JavaScript, React, Svelte
- Node.js, backend APIs, data plumbing
- Product-minded frontend work and end-to-end shipping

## Experience bank
- Add 15 to 25 concrete bullets here
- Include projects, impact, ownership, metrics, and technologies
- Keep the raw details here even if they would not all fit on one resume page

## Narrative notes
- What kinds of teams energize you
- What kinds of problems you want to work on
- What you are strongest at today
`);
    changes.push("seeded starter corpus");
  }

  ensureTable(
    db,
    "tailorings",
    `CREATE TABLE tailorings (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
      corpus_version_id INTEGER NOT NULL REFERENCES corpus_versions(id) ON DELETE CASCADE,
      resume_md TEXT,
      cover_letter_md TEXT,
      qa_json TEXT,
      input_tokens INTEGER,
      output_tokens INTEGER,
      model TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      user_edited_resume_md TEXT,
      user_edited_cover_md TEXT,
      user_edited_qa_json TEXT
    )`,
    changes
  );
  ensureIndex(
    db,
    "idx_tailorings_job_created",
    "CREATE INDEX idx_tailorings_job_created ON tailorings(job_id, created_at DESC)",
    changes
  );
}

function ensureFetchRuns(db, changes) {
  ensureTable(
    db,
    "fetch_runs",
    `CREATE TABLE fetch_runs (
      id TEXT PRIMARY KEY,
      scope TEXT NOT NULL DEFAULT 'cron',
      status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'ok', 'error')),
      companies_attempted INTEGER NOT NULL DEFAULT 0,
      companies_succeeded INTEGER NOT NULL DEFAULT 0,
      companies_failed INTEGER NOT NULL DEFAULT 0,
      new_jobs_found INTEGER NOT NULL DEFAULT 0,
      notifications_sent INTEGER NOT NULL DEFAULT 0,
      errors_json TEXT,
      started_at TEXT NOT NULL DEFAULT (datetime('now')),
      finished_at TEXT,
      duration_ms INTEGER
    )`,
    changes
  );
  ensureIndex(
    db,
    "idx_fetch_runs_started",
    "CREATE INDEX idx_fetch_runs_started ON fetch_runs(started_at DESC)",
    changes
  );
}

function ensurePreferences(db, changes) {
  if (!tableExists(db, "preferences")) return;

  const hasNotifyThreshold = Boolean(
    db.query("SELECT 1 FROM preferences WHERE key = 'notify_threshold' LIMIT 1").get()
  );
  if (!hasNotifyThreshold) {
    const oldValue = db.query("SELECT value FROM preferences WHERE key = 'notification_threshold' LIMIT 1").get()?.value;
    db.query("INSERT OR IGNORE INTO preferences (key, value) VALUES ('notify_threshold', ?)").run(oldValue ?? "50");
    changes.push("normalized notify_threshold preference");
  }

  const legacyKey = db.query("SELECT 1 FROM preferences WHERE key = 'notification_threshold' LIMIT 1").get();
  if (legacyKey) {
    db.exec("DELETE FROM preferences WHERE key = 'notification_threshold'");
    changes.push("removed legacy notification_threshold preference");
  }
}

function ensureMigrationLedger(db, changes) {
  ensureTable(
    db,
    "d1_migrations",
    `CREATE TABLE d1_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE,
      applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
    )`,
    changes
  );
  for (const name of CURRENT_MIGRATIONS) {
    db.query("INSERT OR IGNORE INTO d1_migrations (name) VALUES (?)").run(name);
  }
}

let totalTouched = 0;

for (const filePath of sqliteFiles) {
  const changes = [];
  const db = new Database(filePath);

  try {
    db.exec("PRAGMA foreign_keys = OFF");
    db.exec("BEGIN IMMEDIATE");

    if (!tableExists(db, "companies") || !tableExists(db, "jobs") || !tableExists(db, "preferences") || !tableExists(db, "push_subscriptions")) {
      db.exec("ROLLBACK");
      console.warn(`Skipped ${filePath} because it does not look like a pinkslip database.`);
      db.close();
      continue;
    }

    const migrationUserId = ensureUsers(db, changes);
    ensureEvents(db, changes);
    ensureApplications(db, migrationUserId, changes);
    ensureSavedJobs(db, migrationUserId, changes);
    ensureCompanyColumns(db, changes);
    ensureJobColumns(db, changes);
    ensureDismissedJobs(db, migrationUserId, changes);
    ensureBlockedJobs(db, changes);
    ensurePushIndex(db, changes);
    ensureCorpusAndTailor(db, changes);
    ensureFetchRuns(db, changes);
    ensurePreferences(db, changes);
    ensureMigrationLedger(db, changes);

    db.exec("COMMIT");
    db.exec("PRAGMA foreign_keys = ON");

    if (changes.length > 0) {
      totalTouched += 1;
      console.log(`Repaired ${filePath}`);
      for (const change of changes) {
        console.log(`  - ${change}`);
      }
    }
  } catch (error) {
    try {
      db.exec("ROLLBACK");
    } catch {}
    console.error(`Failed to repair ${filePath}`);
    throw error;
  } finally {
    db.close();
  }
}

if (totalTouched === 0) {
  console.log("Local D1 schema already looks healthy.");
}
