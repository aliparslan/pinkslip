import { Database } from "bun:sqlite";
import { describe, expect, it } from "bun:test";
import { readdirSync } from "node:fs";
import { getAdapter, normalizeCompanySource } from "@worker/ats";

const dir = new URL("../migrations/", import.meta.url).pathname;
const ADD = "0119_add_oracle_and_moved_companies.sql";
const ENABLE = "0121_enable_oracle_and_moved_companies.sql";

describe("adding the oracle and moved companies", () => {
  it("lists readable sources in normalized form", async () => {
    const rows = [...(await Bun.file(`${dir}${ADD}`).text())
      .matchAll(/^ {2}\('((?:[^']|'')+)', '(\w+)', '(\w+)', '((?:[^']|'')+)', '([^']*)'\)/gm)];
    expect(rows).toHaveLength(14);
    for (const [, , , sourceType, slug] of rows) {
      expect(getAdapter(sourceType as never)).not.toBeNull();
      expect(normalizeCompanySource(sourceType as never, slug!)).toBe(slug!);
    }
  });

  it("adds them off, then turns on only this batch", async () => {
    const db = new Database(":memory:");
    for (const file of readdirSync(dir).filter((name) => name.endsWith(".sql") && name < ADD).sort()) {
      db.run(await Bun.file(`${dir}${file}`).text());
    }
    db.run(await Bun.file(`${dir}${ADD}`).text());
    expect(db.query("SELECT source_type, enabled, poll_tier FROM companies WHERE name = 'JPMorgan Chase'").get())
      .toEqual({ source_type: "oracle", enabled: 0, poll_tier: 2 });
    db.run(await Bun.file(`${dir}${ENABLE}`).text());
    expect(db.query("SELECT enabled FROM companies WHERE name = 'JPMorgan Chase'").get()).toEqual({ enabled: 1 });
  });
});
