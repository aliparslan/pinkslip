import { Database } from "bun:sqlite";
import { afterEach, describe, expect, it } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { createGuestSession } from "@worker/auth";
import worker from "@worker/index";
import type { Env } from "@worker/types";
import { sqliteD1 } from "./sqlite-d1";

const migrationsDir = new URL("../migrations/", import.meta.url).pathname;
const databases: Database[] = [];
afterEach(() => { for (const db of databases.splice(0)) db.close(); });

/** The API over a real schema, with every statement it prepares written down. */
function setup() {
  const { sqlite, db } = sqliteD1();
  databases.push(sqlite);
  for (const file of readdirSync(migrationsDir).filter((name) => name.endsWith(".sql")).sort()) {
    sqlite.exec(readFileSync(`${migrationsDir}${file}`, "utf8"));
  }
  const statements: string[] = [];
  const recording = { ...db, prepare: (sql: string) => { statements.push(sql); return db.prepare(sql); }, batch: db.batch.bind(db) } as D1Database;
  const env = { DB: recording } as unknown as Env;
  const ctx = { waitUntil() {}, passThroughOnException() {} } as unknown as ExecutionContext;
  const get = (path: string, token: string) => worker.fetch(new Request(`https://pinkslip.work${path}`, {
    headers: { authorization: `Bearer ${token}`, "x-pinkslip-client": "ios" },
  }), env, ctx);
  return { db, statements, get };
}

const checksJobs = (statements: string[]) => statements.some((sql) => sql.includes("eligible_jobs_cleanup_version"));

describe("what a request costs", () => {
  it("only job and tailoring routes run the catalog's eligibility check", async () => {
    const { db, statements, get } = setup();
    const token = (await createGuestSession(db)).id;

    for (const path of ["/api/v2/me", "/api/v2/bootstrap", "/api/v2/applications", "/api/v2/health"]) {
      statements.length = 0;
      expect((await get(path, token)).status).toBe(200);
      expect({ path, checksJobs: checksJobs(statements) }).toEqual({ path, checksJobs: false });
    }

    statements.length = 0;
    await get("/api/v2/tailor/usage", token);
    expect(checksJobs(statements)).toBe(true);

    statements.length = 0;
    await get("/api/v2/jobs?limit=1", token);
    expect(checksJobs(statements)).toBe(true);
  });
});
