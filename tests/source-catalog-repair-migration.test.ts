import { Database } from "bun:sqlite";
import { describe, expect, it } from "bun:test";
import { readdirSync } from "node:fs";
import { getCompanySourceType, normalizeCompanySource } from "@worker/ats";
import type { CompanyRow } from "@worker/types";

const migrationsDir = new URL("../migrations/", import.meta.url).pathname;
const migrations = readdirSync(migrationsDir).filter((file) => file.endsWith(".sql")).sort();

async function applyMigrations(db: Database, filter: (file: string) => boolean) {
  for (const file of migrations.filter(filter)) {
    db.run(await Bun.file(`${migrationsDir}${file}`).text());
  }
}

function companyId(db: Database, name: string, sourceType: string): string {
  const row = db.query(
    "SELECT id FROM companies WHERE name = ? AND COALESCE(source_type, ats_type) = ?"
  ).get(name, sourceType) as { id: string } | null;
  if (!row) throw new Error(`${name} (${sourceType}) is not in the catalog`);
  return row.id;
}

function addOpenJob(db: Database, id: string, company: string, url: string) {
  db.query(
    `INSERT INTO jobs (id, company_id, external_id, title, url, location, first_seen_at)
     VALUES (?, ?, ?, 'Software Engineer', ?, 'New York, NY', '2026-09-01T00:00:00.000Z')`
  ).run(id, company, id, url);
}

function company(db: Database, id: string) {
  return db.query(
    `SELECT name, ats_type, source_type, ats_slug, website, enabled, poll_tier,
            quarantined_at, poll_failure_count, last_poll_status, last_poll_error
     FROM companies WHERE id = ?`
  ).get(id) as Record<string, unknown>;
}

describe("source catalog repair migration", () => {
  it("re-points moved boards, retires dead ones and leaves admin fixes alone", async () => {
    const db = new Database(":memory:");
    await applyMigrations(db, (file) => file < "0087");

    // Production-like state: failing sources in quarantine, open jobs on dead
    // boards, one source an admin already fixed, and one new board that some
    // other row already polls.
    db.run(`UPDATE companies
            SET last_poll_status = 'error', last_poll_error = 'Greenhouse API 404',
                poll_failure_count = 9, quarantined_at = '2026-08-01T00:00:00.000Z'
            WHERE name IN ('Palantir', 'Kagi', 'Coalition')`);
    const palantir = companyId(db, "Palantir", "greenhouse");
    const kagi = companyId(db, "Kagi", "greenhouse");
    const coalition = companyId(db, "Coalition", "greenhouse");
    const applied = companyId(db, "Applied Intuition", "greenhouse");
    const pulumi = companyId(db, "Pulumi", "greenhouse");
    const postmark = companyId(db, "Postmark", "greenhouse");
    const ghWhatnot = companyId(db, "Whatnot", "greenhouse");
    const ycWhatnot = companyId(db, "Whatnot", "yc");
    const ghEightSleep = companyId(db, "Eight Sleep", "greenhouse");
    const ycEightSleep = companyId(db, "Eight Sleep", "yc");
    addOpenJob(db, "kagi-1", kagi, "https://boards.greenhouse.io/kagi/jobs/1");
    addOpenJob(db, "coalition-1", coalition, "https://boards.greenhouse.io/coalitioninc/jobs/1");
    addOpenJob(db, "eight-sleep-yc-1", ycEightSleep, "https://www.ycombinator.com/companies/eight-sleep/jobs/a");
    db.run(`UPDATE companies SET ats_slug = 'pulumicorporation' WHERE id = '${pulumi}'`);
    db.run(`INSERT INTO companies (id, name, ats_type, source_type, ats_slug)
            VALUES ('dup', 'Applied (admin copy)', 'ashby', 'ashby', 'applied')`);

    await applyMigrations(db, (file) => file >= "0087");

    expect(company(db, palantir)).toMatchObject({
      ats_type: "lever", source_type: "lever", ats_slug: "palantir", enabled: 1, poll_tier: 1,
      quarantined_at: null, poll_failure_count: 0, last_poll_status: null, last_poll_error: null,
    });
    expect(company(db, postmark)).toMatchObject({
      name: "ActiveCampaign", website: "https://www.activecampaign.com",
      source_type: "lever", ats_slug: "activecampaign",
    });
    expect(company(db, ycWhatnot)).toMatchObject({ enabled: 1, ats_slug: "whatnot" });
    expect(company(db, ghWhatnot)).toMatchObject({ enabled: 0, source_type: "greenhouse" });
    expect(company(db, ghEightSleep)).toMatchObject({ enabled: 1, source_type: "ashby", ats_slug: "eightsleep" });
    expect(company(db, ycEightSleep)).toMatchObject({ enabled: 0 });

    // Retired: disabled, out of "needs attention", reason kept.
    expect(company(db, kagi)).toMatchObject({
      enabled: 0, quarantined_at: null, last_poll_status: null, last_poll_error: "Greenhouse API 404",
    });

    // The new board is already another source: retire, don't collide.
    expect(company(db, applied)).toMatchObject({ enabled: 0, ats_slug: "appliedintuition" });
    expect(company(db, "dup")).toMatchObject({ enabled: 1, ats_slug: "applied" });

    // Already fixed in the admin: untouched.
    expect(company(db, pulumi)).toMatchObject({ enabled: 1, source_type: "greenhouse", ats_slug: "pulumicorporation" });

    const jobs = db.query("SELECT id, url, closed_at FROM jobs ORDER BY id").all() as {
      id: string; url: string; closed_at: string | null;
    }[];
    expect(jobs.every((job) => job.closed_at !== null)).toBe(true);
    expect(jobs.find((job) => job.id === "coalition-1")?.url)
      .toBe("https://boards.greenhouse.io/coalition/jobs/1");
    expect(jobs.find((job) => job.id === "kagi-1")?.url).toBe("https://boards.greenhouse.io/kagi/jobs/1");

    expect(db.query("SELECT name FROM sqlite_master WHERE name LIKE 'repair_0087_%'").all()).toEqual([]);
    db.close();
  });

  it("leaves every enabled source with a slug its adapter accepts", async () => {
    const db = new Database(":memory:");
    await applyMigrations(db, () => true);
    const enabled = db.query(
      "SELECT ats_type, source_type, ats_slug FROM companies WHERE enabled = 1"
    ).all() as Pick<CompanyRow, "ats_type" | "source_type" | "ats_slug">[];
    for (const row of enabled) {
      expect(normalizeCompanySource(getCompanySourceType(row), row.ats_slug)).toBe(row.ats_slug);
    }
    db.close();
  });
});
