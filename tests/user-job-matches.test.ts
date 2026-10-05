import { describe, expect, it } from "bun:test";
import { Database } from "bun:sqlite";
import type { JobListing } from "@worker/adapters/types";
import {
  classifyJob,
  ensureJobFeaturesForIds,
  JOB_CLASSIFIER_VERSION,
} from "@worker/job-features";
import {
  catchUpNewJobMatches,
  evaluateJobForProfile,
  ensureUserEvergreenMatchesReady,
  ensureUserJobMatches,
  ensureUserJobMatchesReady,
  matchJobsForNotifiableProfiles,
  MATCHER_VERSION,
  prepareJobsForMatching,
} from "@worker/user-job-matches";
import { saveUserPreferenceState } from "@worker/user-preferences";
import {
  DEFAULT_SEARCH_PROFILE,
  ONBOARDING_VERSION,
  normalizeSearchProfile,
  type RoleId,
} from "../shared/search-profile";

function makeListing(externalId: string): JobListing {
  return {
    externalId,
    title: "Software Engineer",
    url: `https://example.com/jobs/${externalId}`,
    location: "Remote - US",
    department: "Engineering",
    postedAt: new Date().toISOString(),
    description: "Build useful software.",
    salary: null,
  };
}

interface SqlExecution {
  sql: string;
  bindings: unknown[];
}

type SqliteBinding = string | number | bigint | boolean | Uint8Array | null;

function sqliteD1() {
  const sqlite = new Database(":memory:");
  const executions: SqlExecution[] = [];

  function prepared(sql: string, bindings: unknown[] = []): D1PreparedStatement {
    const statement = {
      bind(...values: unknown[]) {
        return prepared(sql, values);
      },
      async all<T>() {
        executions.push({ sql, bindings });
        return {
          results: sqlite.query(sql).all(...bindings as SqliteBinding[]) as T[],
        };
      },
      async first<T>(column?: string) {
        executions.push({ sql, bindings });
        const row = sqlite.query(sql).get(
          ...bindings as SqliteBinding[]
        ) as Record<string, unknown> | null;
        return (column ? row?.[column] : row) as T | null;
      },
      async run() {
        executions.push({ sql, bindings });
        const result = sqlite.query(sql).run(...bindings as SqliteBinding[]);
        return { meta: { changes: result.changes } };
      },
    };
    return statement as unknown as D1PreparedStatement;
  }

  const db = {
    prepare(sql: string) {
      return prepared(sql);
    },
    async batch(statements: D1PreparedStatement[]) {
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      return results;
    },
  } as unknown as D1Database;

  return { sqlite, db, executions };
}

function createMatchingSchema(sqlite: Database) {
  sqlite.exec(`
    CREATE TABLE companies (
      id TEXT PRIMARY KEY,
      enabled INTEGER NOT NULL
    );
    CREATE TABLE jobs (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      external_id TEXT NOT NULL,
      title TEXT NOT NULL,
      url TEXT NOT NULL,
      location TEXT NOT NULL,
      department TEXT,
      posted_at TEXT,
      first_seen_at TEXT NOT NULL,
      description TEXT,
      salary TEXT,
      closed_at TEXT,
      evergreen INTEGER
    );
    CREATE TABLE job_features (
      job_id TEXT PRIMARY KEY,
      role_family TEXT NOT NULL,
      specialties_json TEXT NOT NULL,
      seniority TEXT NOT NULL,
      min_years INTEGER,
      max_years INTEGER,
      work_mode TEXT NOT NULL,
      countries_json TEXT NOT NULL,
      metro_areas_json TEXT NOT NULL,
      salary_min INTEGER,
      salary_max INTEGER,
      salary_currency TEXT,
      salary_period TEXT,
      sponsorship_available INTEGER,
      requires_advanced_degree INTEGER,
      requires_security_clearance INTEGER,
      qualification_requirements_json TEXT,
      classifier_version TEXT NOT NULL,
      confidence REAL NOT NULL,
      source_updated_at TEXT,
      classified_at TEXT
    );
    CREATE TABLE job_review_queue (
      job_id TEXT PRIMARY KEY,
      state TEXT NOT NULL,
      reason_codes_json TEXT NOT NULL,
      evidence_json TEXT NOT NULL,
      classifier_version TEXT NOT NULL,
      admin_note TEXT,
      reviewed_by TEXT,
      reviewed_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE user_job_matches (
      user_id TEXT NOT NULL,
      job_id TEXT NOT NULL,
      matcher_version TEXT NOT NULL,
      matched_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      required_years INTEGER,
      UNIQUE(user_id, job_id)
    );
    CREATE TABLE user_search_profiles (
      user_id TEXT PRIMARY KEY,
      profile_json TEXT NOT NULL,
      notifications_enabled INTEGER NOT NULL,
      onboarding_version INTEGER NOT NULL,
      onboarding_completed_at TEXT,
      match_cursor_seen_at TEXT,
      match_head_seen_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE user_notification_settings (
      user_id TEXT PRIMARY KEY, enabled INTEGER, push_enabled INTEGER, updated_at TEXT
    );
    CREATE TABLE notification_candidates (
      user_id TEXT, status TEXT, last_error TEXT
    );
  `);
}

function seedProfile(sqlite: Database, userId = "user-1") {
  const now = new Date().toISOString();
  sqlite.query(
    `INSERT INTO user_search_profiles (
       user_id, profile_json, notifications_enabled, onboarding_version,
       onboarding_completed_at, match_cursor_seen_at, created_at, updated_at
     ) VALUES (?, ?, 0, 0, NULL, NULL, ?, ?)`
  ).run(userId, JSON.stringify(DEFAULT_SEARCH_PROFILE), now, now);
}

function seedLegacyClearanceJob(
  sqlite: Database,
  options: { id?: string; evergreen?: boolean } = {}
) {
  const id = options.id ?? "legacy-clearance";
  const now = new Date().toISOString();
  const postedAt = options.evergreen ? "2020-01-01T00:00:00.000Z" : now;
  sqlite.query("INSERT OR IGNORE INTO companies (id, enabled) VALUES ('company-1', 1)").run();
  sqlite.query(
    `INSERT INTO jobs (
       id, company_id, external_id, title, url, location, department,
       posted_at, first_seen_at, description, salary, closed_at, evergreen
     ) VALUES (?, 'company-1', ?, 'Software Engineer', ?, 'Remote - US',
       'Engineering', ?, ?, ?, NULL, NULL, ?)`
  ).run(
    id,
    id,
    `https://example.com/jobs/${id}`,
    postedAt,
    now,
    "Requirements: Must be able to obtain a security clearance.",
    options.evergreen ? 1 : 0
  );
  sqlite.query(
    `INSERT INTO job_features (
       job_id, role_family, specialties_json, seniority, min_years, max_years,
       work_mode, countries_json, metro_areas_json, salary_min, salary_max,
       salary_currency, salary_period, sponsorship_available,
       requires_advanced_degree, requires_security_clearance,
       classifier_version, confidence, source_updated_at, classified_at
     ) VALUES (?, 'engineering', '["software_engineering"]', 'unknown', NULL,
       NULL, 'remote', '["US"]', '[]', NULL, NULL, NULL, NULL, NULL, 0, NULL,
       'deterministic-v13-review-context', 0.9, ?, ?)`
  ).run(id, postedAt, now);
  return id;
}

describe("prepareJobsForMatching", () => {
  it("reuses stored features and classifies only jobs that do not have them", () => {
    const storedListing = makeListing("stored");
    const unclassifiedListing = makeListing("unclassified");
    const storedFeatures = classifyJob(storedListing);
    let classifications = 0;

    const prepared = prepareJobsForMatching([
      { jobId: "stored", listing: storedListing, features: storedFeatures },
      { jobId: "unclassified", listing: unclassifiedListing },
    ], (listing) => {
      classifications += 1;
      return classifyJob(listing);
    });

    expect(classifications).toBe(1);
    expect(prepared[0]?.features).toBe(storedFeatures);
    expect(prepared[1]?.features).toEqual(classifyJob(unclassifiedListing));
  });

  it("never reuses an old or incomplete hard-requirement feature set", () => {
    const listing = makeListing("legacy");
    listing.description = "Requirements: Must be able to obtain a security clearance.";
    const legacy = {
      ...classifyJob(makeListing("source")),
      classifier_version: "deterministic-v13-review-context",
      requires_security_clearance: null,
    } as unknown as ReturnType<typeof classifyJob>;
    let classifications = 0;

    const prepared = prepareJobsForMatching(
      [{ jobId: "legacy", listing, features: legacy }],
      (candidate) => {
        classifications += 1;
        return classifyJob(candidate);
      }
    );

    expect(classifications).toBe(1);
    expect(prepared[0]?.features.classifier_version).toBe(JOB_CLASSIFIER_VERSION);
    expect(prepared[0]?.features.requires_security_clearance).toBe(true);
  });
});

describe("career-stage matching", () => {
  it("withholds internships until onboarding v3 confirms the saved stages", () => {
    const internship = makeListing("internship");
    internship.title = "Software Engineering Intern";
    const features = classifyJob(internship);
    const migrated = normalizeSearchProfile({
      ...DEFAULT_SEARCH_PROFILE,
      onboarding_version: ONBOARDING_VERSION - 1,
      target_levels: ["internship", "new_grad", "early_career"],
      location_ids: [],
    });
    const confirmed = normalizeSearchProfile({
      ...migrated,
      onboarding_version: ONBOARDING_VERSION,
      onboarding_completed_at: new Date().toISOString(),
    });

    expect(evaluateJobForProfile(
      "internship",
      internship,
      features,
      migrated
    ).plausible).toBe(false);
    expect(evaluateJobForProfile(
      "internship",
      internship,
      features,
      confirmed
    ).plausible).toBe(true);
  });

  it("matches shorthand internship disciplines to every selectable role family", () => {
    const cases: Array<[string, RoleId]> = [
      ["Engineering Intern", "software_engineering"],
      ["Forward Deployed Engineering Intern", "forward_deployed"],
      ["UI Intern", "frontend"],
      ["Backend Intern", "backend"],
      ["Full Stack Intern", "full_stack"],
      ["iOS Intern", "mobile"],
      ["Data Engineering Intern", "data_engineering"],
      ["Data Scientist Intern", "machine_learning"],
      ["Applied Scientist Intern", "research"],
      ["DevOps Intern", "infrastructure"],
      ["Cybersecurity Intern", "security"],
    ];

    for (const [title, role] of cases) {
      const internship = makeListing(`internship-${role}`);
      internship.title = title;
      const features = classifyJob(internship);
      const profile = normalizeSearchProfile({
        ...DEFAULT_SEARCH_PROFILE,
        roles: [role],
        target_levels: ["internship"],
        location_ids: [],
        onboarding_version: ONBOARDING_VERSION,
        onboarding_completed_at: new Date().toISOString(),
      });

      expect(features.specialties).toContain(role);
      expect(evaluateJobForProfile(
        internship.externalId,
        internship,
        features,
        profile
      ).plausible).toBe(true);
    }
  });

  it("assigns an unlevelled posting to early-career only", () => {
    const listing = makeListing("generic");
    const features = classifyJob(listing);
    const profile = (target_levels: Array<"new_grad" | "early_career">) =>
      normalizeSearchProfile({
        ...DEFAULT_SEARCH_PROFILE,
        onboarding_version: ONBOARDING_VERSION,
        onboarding_completed_at: new Date().toISOString(),
        target_levels,
        location_ids: [],
      });

    expect(features.seniority).toBe("early_career");
    expect(evaluateJobForProfile("generic", listing, features, profile(["new_grad"])).plausible)
      .toBe(false);
    expect(evaluateJobForProfile("generic", listing, features, profile(["early_career"])).plausible)
      .toBe(true);
  });
});

describe("database feature freshness", () => {
  it("preserves new preferences when an older client saves, and invalidates feed and pending alerts", async () => {
    const { sqlite, db } = sqliteD1();
    createMatchingSchema(sqlite);
    seedProfile(sqlite);
    const profile = normalizeSearchProfile({ ...DEFAULT_SEARCH_PROFILE, highest_education: "master", years_experience: 2, max_required_years: null, include_unspecified_experience: false, doctoral_student: true, doctoral_internships: "only" });
    sqlite.query("UPDATE user_search_profiles SET profile_json = ?, match_cursor_seen_at = ?").run(JSON.stringify(profile), "2026-01-01");
    sqlite.query("INSERT INTO user_job_matches VALUES ('user-1', 'job', ?, 'now', 'now', NULL)").run(MATCHER_VERSION);
    sqlite.exec("INSERT INTO notification_candidates VALUES ('user-1', 'pending', NULL)");
    const { highest_education, max_required_years, include_unspecified_experience, doctoral_student, doctoral_internships, ...legacy } = profile;
    const saved = await saveUserPreferenceState(db, "user-1", { search_profile: { ...legacy, version: 4, years_experience: 1 } });
    expect(saved.search_profile).toMatchObject({ highest_education, max_required_years, include_unspecified_experience, doctoral_student, doctoral_internships, years_experience: 1 });
    expect(sqlite.query("SELECT COUNT(*) AS count FROM user_job_matches").get()).toEqual({ count: 0 });
    expect(sqlite.query("SELECT match_cursor_seen_at FROM user_search_profiles").get()).toEqual({ match_cursor_seen_at: null });
    expect(sqlite.query("SELECT status FROM notification_candidates").get()).toEqual({ status: "skipped" });
    sqlite.close();
  });

  it("uses cached degree routes during database matching, including evergreen rows without full text", async () => {
    const { sqlite, db } = sqliteD1();
    createMatchingSchema(sqlite);
    seedProfile(sqlite);
    const jobId = seedLegacyClearanceJob(sqlite, { evergreen: true });
    sqlite.query("UPDATE jobs SET description = ? WHERE id = ?").run("<h2>Requirements</h2><li>Bachelor's + 4 years OR master's + 2 years.</li>", jobId);
    sqlite.query("UPDATE user_search_profiles SET profile_json = ?").run(JSON.stringify(normalizeSearchProfile({ ...DEFAULT_SEARCH_PROFILE, highest_education: "bachelor", max_required_years: 3, location_ids: [] })));
    await ensureUserEvergreenMatchesReady(db, "user-1");
    expect(sqlite.query("SELECT COUNT(*) AS count FROM user_job_matches").get()).toEqual({ count: 0 });
    const stored = sqlite.query("SELECT qualification_requirements_json FROM job_features WHERE job_id = ?").get(jobId) as { qualification_requirements_json: string };
    expect(JSON.parse(stored.qualification_requirements_json).groups[0]).toHaveLength(2);
    sqlite.query("UPDATE user_search_profiles SET profile_json = ?").run(JSON.stringify(normalizeSearchProfile({ ...DEFAULT_SEARCH_PROFILE, highest_education: "master", max_required_years: 2, location_ids: [] })));
    await ensureUserEvergreenMatchesReady(db, "user-1");
    expect(sqlite.query("SELECT COUNT(*) AS count FROM user_job_matches").get()).toEqual({ count: 1 });
    expect(sqlite.query("SELECT required_years FROM user_job_matches").get()).toEqual({ required_years: 2 });
    sqlite.close();
  });

  it("reclassifies an exact normal candidate before matching and removes its old match", async () => {
    const { sqlite, db } = sqliteD1();
    createMatchingSchema(sqlite);
    seedProfile(sqlite);
    const jobId = seedLegacyClearanceJob(sqlite);
    const now = new Date().toISOString();
    sqlite.query(
      `INSERT INTO user_job_matches (
         user_id, job_id, matcher_version, matched_at, updated_at
       ) VALUES ('user-1', ?, 'profile-v8-fixed-requirements', ?, ?)`
    ).run(jobId, now, now);

    const matches = await ensureUserJobMatches(db, "user-1");

    expect(matches).toEqual([{ jobId, plausible: false, requiredYears: null }]);
    expect(sqlite.query(
      "SELECT classifier_version FROM job_features WHERE job_id = ?"
    ).get(jobId)).toEqual({ classifier_version: JOB_CLASSIFIER_VERSION });
    expect(sqlite.query(
      "SELECT requires_security_clearance FROM job_features WHERE job_id = ?"
    ).get(jobId)).toEqual({ requires_security_clearance: 1 });
    expect(sqlite.query(
      "SELECT COUNT(*) AS count FROM user_job_matches WHERE user_id = 'user-1'"
    ).get()).toEqual({ count: 0 });
    sqlite.close();
  });

  it("reclassifies stale evergreen candidates instead of leaking a match", async () => {
    const { sqlite, db } = sqliteD1();
    createMatchingSchema(sqlite);
    seedProfile(sqlite);
    const jobId = seedLegacyClearanceJob(sqlite, { evergreen: true });

    await ensureUserEvergreenMatchesReady(db, "user-1");

    expect(sqlite.query(
      "SELECT requires_security_clearance FROM job_features WHERE job_id = ?"
    ).get(jobId)).toEqual({ requires_security_clearance: 1 });
    expect(sqlite.query(
      "SELECT COUNT(*) AS count FROM user_job_matches WHERE user_id = 'user-1'"
    ).get()).toEqual({ count: 0 });
    sqlite.close();
  });

  it("chunks exact feature warming below D1's bind limit", async () => {
    const { sqlite, db, executions } = sqliteD1();
    createMatchingSchema(sqlite);
    sqlite.query("INSERT INTO companies (id, enabled) VALUES ('company-1', 1)").run();
    const insert = sqlite.query(
      `INSERT INTO jobs (
         id, company_id, external_id, title, url, location, department,
         posted_at, first_seen_at, description, salary, closed_at, evergreen
       ) VALUES (?, 'company-1', ?, 'Software Engineer', ?, 'Remote - US',
         'Engineering', ?, ?, 'Build reliable software.', NULL, NULL, 0)`
    );
    const now = new Date().toISOString();
    const ids = Array.from({ length: 151 }, (_, index) => `job-${index}`);
    for (const id of ids) {
      insert.run(id, id, `https://example.com/jobs/${id}`, now, now);
    }

    await ensureJobFeaturesForIds(db, ids);

    const featureLoads = executions.filter(({ sql }) =>
      sql.includes("FROM jobs j") && sql.includes("WHERE j.id IN")
    );
    expect(featureLoads.map(({ bindings }) => bindings.length)).toEqual([76, 76, 2]);
    expect(sqlite.query("SELECT COUNT(*) AS count FROM job_features").get())
      .toEqual({ count: 151 });
    sqlite.close();
  });
});

describe("notification-scoped matching", () => {
  const T0 = "2026-10-04T12:00:00.000Z";
  const at = (minutes: number) => new Date(Date.parse(T0) + minutes * 60 * 1000).toISOString();

  function createNotificationSchema(sqlite: Database) {
    createMatchingSchema(sqlite);
    sqlite.exec("CREATE TABLE push_subscriptions (id TEXT PRIMARY KEY, user_id TEXT NOT NULL)");
  }

  function seedMatchingProfile(
    sqlite: Database,
    userId: string,
    options: { notifications?: boolean; headSeenAt?: string | null } = {}
  ) {
    const profile = normalizeSearchProfile({
      ...DEFAULT_SEARCH_PROFILE,
      onboarding_version: ONBOARDING_VERSION,
      onboarding_completed_at: T0,
      target_levels: ["early_career"],
      location_ids: [],
    });
    sqlite.query(
      `INSERT INTO user_search_profiles (
         user_id, profile_json, notifications_enabled, onboarding_version,
         onboarding_completed_at, match_cursor_seen_at, match_head_seen_at,
         created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?)`
    ).run(
      userId,
      JSON.stringify(profile),
      options.notifications ? 1 : 0,
      ONBOARDING_VERSION,
      T0,
      options.headSeenAt === undefined ? T0 : options.headSeenAt,
      T0,
      T0
    );
  }

  function seedNewJob(sqlite: Database, id: string, firstSeenAt: string) {
    sqlite.query("INSERT OR IGNORE INTO companies (id, enabled) VALUES ('company-1', 1)").run();
    sqlite.query(
      `INSERT INTO jobs (
         id, company_id, external_id, title, url, location, department,
         posted_at, first_seen_at, description, salary, closed_at, evergreen
       ) VALUES (?, 'company-1', ?, 'Software Engineer', ?, 'Remote - US',
         'Engineering', ?, ?, 'Build useful software.', NULL, NULL, 0)`
    ).run(id, id, `https://example.com/jobs/${id}`, new Date().toISOString(), firstSeenAt);
  }

  const matchedJobs = (sqlite: Database, userId: string) =>
    (sqlite.query(
      "SELECT job_id FROM user_job_matches WHERE user_id = ? ORDER BY job_id"
    ).all(userId) as Array<{ job_id: string }>).map((row) => row.job_id);

  it("evaluates new jobs only for profiles that can receive a push", async () => {
    const { sqlite, db } = sqliteD1();
    createNotificationSchema(sqlite);
    seedMatchingProfile(sqlite, "subscribed", { notifications: true });
    seedMatchingProfile(sqlite, "guest");
    seedMatchingProfile(sqlite, "muted", { notifications: true });
    seedMatchingProfile(sqlite, "no-device", { notifications: true });
    sqlite.run(`INSERT INTO push_subscriptions VALUES ('s1', 'subscribed'), ('s2', 'muted')`);
    sqlite.run(`INSERT INTO user_notification_settings (user_id, enabled, push_enabled) VALUES ('muted', 1, 0)`);

    await matchJobsForNotifiableProfiles(db, [{ jobId: "j1", listing: makeListing("j1") }]);

    expect(matchedJobs(sqlite, "subscribed")).toEqual(["j1"]);
    expect(matchedJobs(sqlite, "guest")).toEqual([]);
    expect(matchedJobs(sqlite, "muted")).toEqual([]);
    expect(matchedJobs(sqlite, "no-device")).toEqual([]);
    sqlite.close();
  });

  it("catches a feed up on jobs discovered after its watermark", async () => {
    const { sqlite, db } = sqliteD1();
    createNotificationSchema(sqlite);
    seedMatchingProfile(sqlite, "guest");
    seedNewJob(sqlite, "before", at(-60));
    // Same poll as the watermark: re-evaluated, never skipped.
    seedNewJob(sqlite, "boundary", T0);
    seedNewJob(sqlite, "after-1", at(1));
    seedNewJob(sqlite, "after-2", at(2));

    expect(await catchUpNewJobMatches(db, "guest")).toBe(3);
    expect(matchedJobs(sqlite, "guest")).toEqual(["after-1", "after-2", "boundary"]);
    expect(sqlite.query(
      "SELECT match_head_seen_at FROM user_search_profiles WHERE user_id = 'guest'"
    ).get()).toEqual({ match_head_seen_at: at(2) });

    seedNewJob(sqlite, "after-3", at(3));
    expect(await catchUpNewJobMatches(db, "guest")).toBe(2);
    expect(matchedJobs(sqlite, "guest")).toContain("after-3");
    sqlite.close();
  });

  it("initializes a missing watermark from the newest job", async () => {
    const { sqlite, db } = sqliteD1();
    createNotificationSchema(sqlite);
    seedMatchingProfile(sqlite, "fresh", { headSeenAt: null });
    seedNewJob(sqlite, "older", at(-5));
    seedNewJob(sqlite, "newest", at(5));

    await catchUpNewJobMatches(db, "fresh");

    expect(matchedJobs(sqlite, "fresh")).toEqual(["newest", "older"]);
    expect(sqlite.query(
      "SELECT match_head_seen_at FROM user_search_profiles WHERE user_id = 'fresh'"
    ).get()).toEqual({ match_head_seen_at: at(5) });
    sqlite.close();
  });

  it("still surfaces new jobs when the feed already has enough matches", async () => {
    const { sqlite, db } = sqliteD1();
    createNotificationSchema(sqlite);
    seedMatchingProfile(sqlite, "guest");
    seedNewJob(sqlite, "after", at(1));

    await ensureUserJobMatchesReady(db, "guest", 0);

    expect(matchedJobs(sqlite, "guest")).toEqual(["after"]);
    sqlite.close();
  });
});
