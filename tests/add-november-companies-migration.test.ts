import { Database } from "bun:sqlite";
import { describe, expect, it } from "bun:test";
import { readdirSync } from "node:fs";
import { getAdapter, normalizeCompanySource } from "@worker/ats";

const migrationsDir = new URL("../migrations/", import.meta.url).pathname;
const ADD = "0117_add_approved_companies_nov.sql";
const migrations = readdirSync(migrationsDir).filter((file) => file.endsWith(".sql")).sort();

async function databaseBefore() {
  const db = new Database(":memory:");
  for (const file of migrations.filter((name) => name < ADD)) {
    db.run(await Bun.file(`${migrationsDir}${file}`).text());
  }
  return db;
}

const added = async () => [...(await Bun.file(`${migrationsDir}${ADD}`).text())
  .matchAll(/^ {2}\('((?:[^']|'')+)', '(\w+)', '(\w+)', '((?:[^']|'')+)', '([^']*)'\)/gm)];

describe("adding the companies approved in november", () => {
  it("lists readable sources in normalized form", async () => {
    const rows = await added();
    expect(rows.length).toBe(529);
    for (const [, , , sourceType, slug] of rows) {
      expect(getAdapter(sourceType as never)).not.toBeNull();
      expect(normalizeCompanySource(sourceType as never, slug!.replaceAll("''", "'"))).toBe(slug!.replaceAll("''", "'"));
    }
  });

  it("adds them off, so backfilling their catalogs can't reach anyone as alerts", async () => {
    const db = await databaseBefore();
    db.run(`INSERT INTO companies (id, name, ats_type, source_type, ats_slug, website, enabled)
            VALUES ('kept', 'Zillow', 'greenhouse', 'greenhouse', 'zillow-by-hand', 'https://example.com', 1)`);
    const before = (db.query("SELECT COUNT(*) AS n FROM companies").get() as { n: number }).n;
    db.run(await Bun.file(`${migrationsDir}${ADD}`).text());

    expect(db.query("SELECT source_type, enabled, poll_tier, website FROM companies WHERE name = 'Harvey'").get())
      .toEqual({ source_type: "ashby", enabled: 0, poll_tier: 2, website: "https://harvey.ai" });
    expect(db.query("SELECT website FROM companies WHERE name = 'Hilbert'").get()).toEqual({ website: "" });
    expect(db.query("SELECT enabled, ats_slug FROM companies WHERE name = 'Zillow'").get())
      .toEqual({ enabled: 1, ats_slug: "zillow-by-hand" });
    const after = (db.query("SELECT COUNT(*) AS n FROM companies").get() as { n: number }).n;
    expect(after).toBeGreaterThan(before + 500);
    expect(db.query("SELECT name FROM sqlite_master WHERE name = 'add_0117_companies'").get()).toBeNull();
  });
});
