import { Database } from "bun:sqlite";
import { describe, expect, it } from "bun:test";
import { readdirSync } from "node:fs";
import { getAdapter, normalizeCompanySource } from "@worker/ats";

const migrationsDir = new URL("../migrations/", import.meta.url).pathname;
const migrations = readdirSync(migrationsDir).filter((file) => file.endsWith(".sql")).sort();
const REPAIR = "0112_source_repair_2026_11.sql";

async function databaseBeforeRepair() {
  const db = new Database(":memory:");
  for (const file of migrations.filter((name) => name < REPAIR)) {
    db.run(await Bun.file(`${migrationsDir}${file}`).text());
  }
  return db;
}

function addSource(db: Database, name: string, atsType: string, sourceType: string, slug: string) {
  db.query("DELETE FROM companies WHERE name = ?").run(name);
  db.query(
    `INSERT INTO companies (id, name, ats_type, source_type, ats_slug, website, enabled,
       poll_failure_count, quarantined_at, last_poll_status, last_poll_error)
     VALUES (?, ?, ?, ?, ?, '', 1, 40, '2026-10-01T00:00:00.000Z', 'error', 'API 404')`
  ).run(`test-${name}`, name, atsType, sourceType, slug);
}

function row(db: Database, name: string) {
  return db.query(
    `SELECT ats_type, source_type, ats_slug, enabled, poll_tier, quarantined_at,
            poll_failure_count, last_poll_status, last_poll_error
     FROM companies WHERE name = ?`
  ).get(name) as Record<string, unknown>;
}

async function applyRepair(db: Database) {
  db.run(await Bun.file(`${migrationsDir}${REPAIR}`).text());
}

describe("source repair migration, November 2026", () => {
  it("re-points moved boards and clears their failure state", async () => {
    const db = await databaseBeforeRepair();
    addSource(db, "Two Sigma", "greenhouse", "greenhouse", "twosigma");
    addSource(db, "Retool", "ashby", "ashby", "retool");
    await applyRepair(db);

    expect(row(db, "Two Sigma")).toEqual(expect.objectContaining({
      ats_type: "custom",
      source_type: "avature",
      ats_slug: "https://careers.twosigma.com/careers/OpenRoles",
      enabled: 1,
      poll_tier: 2,
      quarantined_at: null,
      poll_failure_count: 0,
      last_poll_status: null,
      last_poll_error: null,
    }));
    expect(row(db, "Retool")).toEqual(expect.objectContaining({
      source_type: "gem",
      ats_slug: "retool",
    }));
  });

  it("retires dead boards with the reason, leaving the row in place", async () => {
    const db = await databaseBeforeRepair();
    addSource(db, "Deno", "lever", "lever", "deno");
    await applyRepair(db);

    expect(row(db, "Deno")).toEqual(expect.objectContaining({
      enabled: 0,
      quarantined_at: null,
      last_poll_status: null,
      last_poll_error: "joining Cloudflare; careers page is gone",
    }));
  });

  it("leaves a source an admin already fixed alone", async () => {
    const db = await databaseBeforeRepair();
    addSource(db, "Retool", "custom", "gem", "retool-already-fixed");
    await applyRepair(db);

    expect(row(db, "Retool")).toEqual(expect.objectContaining({
      source_type: "gem",
      ats_slug: "retool-already-fixed",
      poll_failure_count: 40,
    }));
  });

  it("uses only sources the worker can poll, in normalized form", async () => {
    const sql = await Bun.file(`${migrationsDir}${REPAIR}`).text();
    const moves = [...sql.matchAll(/^ {2}\('[^']+', '[a-z]+', '[^']+', '[a-z]+', '([a-z]+)', '([^']+)', [12]\)/gm)];
    expect(moves).toHaveLength(10);
    for (const [, sourceType, slug] of moves) {
      expect(getAdapter(sourceType as never)).not.toBeNull();
      expect(normalizeCompanySource(sourceType as never, slug!)).toBe(slug!);
    }
  });
});
