import { Database } from "bun:sqlite";
import { describe, expect, it } from "bun:test";
import {
  buildStageExperienceFilter,
  JOB_FEED_ORDER_BY,
  JOB_MATCH_FACT_CASE,
  parseStageFilter,
} from "@worker/routes/jobs";

describe("job feed order", () => {
  it("orders by the full normalized source timestamp before discovery time", () => {
    const db = new Database(":memory:");
    db.run(`
      CREATE TABLE jobs (
        id TEXT PRIMARY KEY,
        posted_at TEXT,
        first_seen_at TEXT NOT NULL
      )
    `);
    const insert = db.prepare(
      "INSERT INTO jobs (id, posted_at, first_seen_at) VALUES (?, ?, ?)"
    );

    insert.run("date-only-early", "2026-08-28T00:00:00.000Z", "2026-08-28T19:46:59.935Z");
    insert.run("apple-late", "2026-08-28T18:42:21.632Z", "2026-08-28T18:53:44.264Z");
    insert.run("offset-latest", "2026-08-28T15:50:04-04:00", "2026-08-28T20:01:30.160Z");
    insert.run("undated-new", null, "2026-08-28T20:05:00.000Z");

    const rows = db.query<{ id: string }, []>(
      `SELECT j.id FROM jobs j ORDER BY ${JOB_FEED_ORDER_BY}`
    ).all();

    expect(rows.map((row) => row.id)).toEqual([
      "undated-new",
      "offset-latest",
      "apple-late",
      "date-only-early",
    ]);
  });
});

describe("career-stage feed query", () => {
  it("strictly parses known stages and deduplicates them", () => {
    expect(parseStageFilter(undefined)).toBeUndefined();
    expect(parseStageFilter("internship,new_grad,internship")).toEqual([
      "internship",
      "new_grad",
    ]);
    expect(parseStageFilter("early_career")).toEqual(["early_career"]);
  });

  it("rejects empty, unknown, and legacy level values", () => {
    expect(parseStageFilter("")).toBeNull();
    expect(parseStageFilter("internship,")).toBeNull();
    expect(parseStageFilter(",new_grad")).toBeNull();
    expect(parseStageFilter("internship,,new_grad")).toBeNull();
    expect(parseStageFilter("new_grad,senior")).toBeNull();
    expect(parseStageFilter("mid_level")).toBeNull();
  });

  it("gives stages precedence while retaining legacy YOE behavior when absent", () => {
    expect(buildStageExperienceFilter(["internship", "new_grad"], 2, 3)).toEqual({
      conditions: ["jf.seniority IN (?, ?)"],
      bindings: ["internship", "new_grad"],
    });
    expect(buildStageExperienceFilter(undefined, 1, 3)).toEqual({
      conditions: [
        "(us.required_years IS NULL OR us.required_years <= ?)",
        "us.required_years IS NOT NULL AND us.required_years >= ?",
      ],
      bindings: [3, 1],
    });
  });

  it("labels internships before the shared zero-year fallback", () => {
    const db = new Database(":memory:");
    db.run("CREATE TABLE job_features (seniority TEXT, required_years INTEGER)");
    db.run("INSERT INTO job_features VALUES ('internship', 0), ('new_grad', 0), ('early_career', 2)");

    const rows = db.query<{ match_fact: string }, []>(
      `SELECT ${JOB_MATCH_FACT_CASE} AS match_fact FROM job_features jf JOIN job_features us ON us.rowid = jf.rowid ORDER BY jf.rowid`
    ).all();
    expect(rows.map((row) => row.match_fact)).toEqual([
      "Internship",
      "New-grad role",
      "Asks for 2+ years",
    ]);
  });
  it("uses each user's degree route and admits known five-year senior roles in the expanded stage", () => {
    const db = new Database(":memory:");
    db.exec("CREATE TABLE job_features (job_id TEXT, seniority TEXT, min_years INTEGER); CREATE TABLE user_job_matches (job_id TEXT, required_years INTEGER); INSERT INTO job_features VALUES ('degree-route', 'early_career', 1), ('senior-five', 'senior', 5), ('mid-four', 'mid_level', 4); INSERT INTO user_job_matches VALUES ('degree-route', 5), ('senior-five', 5), ('mid-four', 4);");
    const select = (filter: ReturnType<typeof buildStageExperienceFilter>) => db.query<{ job_id: string }, any[]>(`SELECT jf.job_id FROM job_features jf JOIN user_job_matches us ON us.job_id = jf.job_id WHERE ${filter.conditions.join(" AND ")} ORDER BY jf.job_id`).all(...filter.bindings).map(row => row.job_id);
    expect(select(buildStageExperienceFilter(undefined, null, 3))).toEqual([]);
    expect(select(buildStageExperienceFilter(undefined, 5, 5))).toEqual(["degree-route", "senior-five"]);
    expect(select(buildStageExperienceFilter(["early_career"], null, null))).toEqual(["degree-route", "mid-four", "senior-five"]);
    db.close();
  });

});
