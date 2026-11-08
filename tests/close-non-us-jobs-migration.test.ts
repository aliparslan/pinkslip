import { Database } from "bun:sqlite";
import { describe, expect, it } from "bun:test";
import { readdirSync } from "node:fs";
import { isUsJobLocation } from "@worker/us-jobs";

const migrationsDir = new URL("../migrations/", import.meta.url).pathname;
const migrations = readdirSync(migrationsDir).filter((file) => file.endsWith(".sql")).sort();
const CLOSE = "0114_close_non_us_jobs_2026_11.sql";

async function closingSql() {
  return Bun.file(`${migrationsDir}${CLOSE}`).text();
}

function addJob(db: Database, id: string, location: string, closedAt: string | null = null) {
  db.query(
    `INSERT INTO jobs (id, company_id, external_id, title, url, location, first_seen_at, closed_at)
     VALUES (?, 'test-co', ?, 'Software Engineer', 'https://example.com', ?, '2026-10-01T00:00:00.000Z', ?)`
  ).run(id, id, location, closedAt);
}

function closedAt(db: Database, id: string) {
  return (db.query("SELECT closed_at FROM jobs WHERE id = ?").get(id) as { closed_at: string | null }).closed_at;
}

describe("closing non-US jobs, November 2026", () => {
  it("closes listed locations and leaves anything with a US option open", async () => {
    const db = new Database(":memory:");
    for (const file of migrations.filter((name) => name < CLOSE)) {
      db.run(await Bun.file(`${migrationsDir}${file}`).text());
    }
    db.run(`INSERT INTO companies (id, name, ats_type, ats_slug) VALUES ('test-co', 'Test Co', 'greenhouse', 'test-co')`);
    addJob(db, "india", "IN-Pune");
    addJob(db, "toronto", "Toronto, ON, CA");
    addJob(db, "mixed", "Pittsburgh, San Francisco, Bengaluru");
    addJob(db, "us", "US-CA-Menlo Park");
    addJob(db, "already", "IN-Pune", "2026-10-02T00:00:00.000Z");

    db.run(await closingSql());

    expect(closedAt(db, "india")).not.toBeNull();
    expect(closedAt(db, "toronto")).not.toBeNull();
    expect(closedAt(db, "mixed")).toBeNull();
    expect(closedAt(db, "us")).toBeNull();
    expect(closedAt(db, "already")).toBe("2026-10-02T00:00:00.000Z");
  });

  it("names only locations the filter rejects, so the poller won't reopen them", async () => {
    const locations = [...(await closingSql()).matchAll(/^ {4}'(.+)',?$/gm)].map(([, location]) => location!);
    expect(locations).toHaveLength(11);
    for (const location of locations) expect(isUsJobLocation(location)).toBe(false);
  });
});
