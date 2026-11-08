import { Database } from "bun:sqlite";
import { describe, expect, it } from "bun:test";
import { readdirSync } from "node:fs";
import { getAdapter, normalizeCompanySource } from "@worker/ats";

const migrationsDir = new URL("../migrations/", import.meta.url).pathname;
const migrations = readdirSync(migrationsDir).filter((file) => file.endsWith(".sql")).sort();
const ADD = "0116_add_approved_companies.sql";

async function databaseBefore() {
  const db = new Database(":memory:");
  for (const file of migrations.filter((name) => name < ADD)) {
    db.run(await Bun.file(`${migrationsDir}${file}`).text());
  }
  return db;
}

const added = async () => [...(await Bun.file(`${migrationsDir}${ADD}`).text())
  .matchAll(/^ {2}\('((?:[^']|'')+)', '(\w+)', '(\w+)', '((?:[^']|'')+)', '([^']*)', ([12])\)/gm)];

describe("adding the approved companies", () => {
  it("lists 76 pollable sources in normalized form", async () => {
    const rows = await added();
    expect(rows).toHaveLength(76);
    for (const [, , , sourceType, slug] of rows) {
      expect(getAdapter(sourceType as never)).not.toBeNull();
      expect(normalizeCompanySource(sourceType as never, slug!)).toBe(slug!);
    }
  });

  it("adds new sources enabled and skips ones already in the catalog", async () => {
    const db = await databaseBefore();
    db.run("DELETE FROM companies WHERE name IN ('Capital One', 'Okta', 'Brex')");
    db.run(`INSERT INTO companies (id, name, ats_type, source_type, ats_slug, website, enabled)
            VALUES ('kept', 'Okta', 'greenhouse', 'greenhouse', 'okta-by-hand', 'https://example.com', 0)`);
    db.run(await Bun.file(`${migrationsDir}${ADD}`).text());

    const brex = db.query("SELECT source_type, enabled, website, poll_tier FROM companies WHERE name = 'Brex'").get();
    expect(brex).toEqual({ source_type: "greenhouse", enabled: 1, website: "https://brex.com", poll_tier: 1 });
    const capitalOne = db.query("SELECT source_type, ats_type, poll_tier FROM companies WHERE name = 'Capital One'").get();
    expect(capitalOne).toEqual({ source_type: "workday", ats_type: "custom", poll_tier: 2 });
    const okta = db.query("SELECT id, ats_slug, enabled FROM companies WHERE name = 'Okta'").all();
    expect(okta).toEqual([{ id: "kept", ats_slug: "okta-by-hand", enabled: 0 }]);
  });
});
