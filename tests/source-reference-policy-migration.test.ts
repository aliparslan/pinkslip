import { Database } from "bun:sqlite";
import { describe, expect, it } from "bun:test";

describe("source reference inspection policy migration", () => {
  it("marks existing references as policy v1 so they can be re-inspected once", async () => {
    const db = new Database(":memory:");
    db.run("PRAGMA foreign_keys = ON");
    db.run("CREATE TABLE companies (id TEXT PRIMARY KEY)");
    db.run("INSERT INTO companies (id) VALUES ('meta')");
    db.run(await Bun.file(new URL(
      "../migrations/0075_source_job_references.sql",
      import.meta.url
    )).text());
    db.run(`INSERT INTO source_job_references (
      company_id, external_id, job_url, first_seen_at, last_seen_at
    ) VALUES ('meta', 'old', 'https://example.com/old', '2026-01-01', '2026-01-01')`);

    db.run(await Bun.file(new URL(
      "../migrations/0077_source_reference_policy_version.sql",
      import.meta.url
    )).text());

    expect(db.query(
      "SELECT inspection_policy_version FROM source_job_references WHERE external_id = 'old'"
    ).get()).toEqual({ inspection_policy_version: 1 });
    db.close();
  });
});
