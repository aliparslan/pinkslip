import { Database } from "bun:sqlite";
import { afterEach, describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import {
  alertNewErrors,
  buildErrorAlertPayload,
  errorKind,
  normalizeRoute,
  recordError,
  type ErrorRow,
} from "@worker/errors";
import worker from "@worker/index";
import type { NotificationPayload } from "@worker/push";
import { NEW_APP_KINDS_PER_HOUR } from "@worker/routes/errors";
import type { Env } from "@worker/types";
import { sqliteD1 } from "./sqlite-d1";

const migration = readFileSync(new URL("../migrations/0093_errors.sql", import.meta.url).pathname, "utf8");
const databases: Database[] = [];
afterEach(() => {
  for (const db of databases.splice(0)) db.close();
});

/** Only the errors table: any other query fails, which is how the API test breaks a route. */
function errorsDb() {
  const harness = sqliteD1();
  databases.push(harness.sqlite);
  harness.sqlite.exec(migration);
  return harness;
}

function rows(sqlite: Database): ErrorRow[] {
  return sqlite.query("SELECT * FROM errors ORDER BY rowid").all() as ErrorRow[];
}

function context() {
  const pending: Promise<unknown>[] = [];
  return {
    ctx: { waitUntil: (promise: Promise<unknown>) => pending.push(promise), passThroughOnException() {} } as unknown as ExecutionContext,
    settle: () => Promise.all(pending),
  };
}

describe("errorKind", () => {
  it("groups the same fault however its ids and numbers differ", () => {
    expect(errorKind("TypeError", "Cannot read properties of undefined (reading 'title') at job 3f9a2b1c7d"))
      .toBe(errorKind("TypeError", "Cannot read properties of undefined (reading 'title') at job 0a1b2c3d4e"));
    expect(errorKind("Error", "Could not load Apple signing keys (503)"))
      .toBe("Error: Could not load Apple signing keys (<n>)");
    expect(errorKind("Error", "No session 6f1c2d3e-0000-4a5b-8c9d-112233445566 for row 42"))
      .toBe("Error: No session <id> for row <n>");
  });

  it("takes out emails and links but keeps words that contain a digit", () => {
    expect(errorKind("Error", "D1_ERROR: UNIQUE constraint failed for jane.doe@example.com via https://pinkslip.work/jobs/1"))
      .toBe("Error: D1_ERROR: UNIQUE constraint failed for <email> via <url>");
  });

  it("falls back to the name when there is no message", () => {
    expect(errorKind("RangeError", "")).toBe("RangeError");
    expect(errorKind(null, "boom")).toBe("Error: boom");
  });
});

describe("normalizeRoute", () => {
  it("turns ids in a path into :id and drops the query", () => {
    expect(normalizeRoute("/jobs/greenhouse-stripe-7712345?ref=push")).toBe("/jobs/:id");
    expect(normalizeRoute("/you/admin")).toBe("/you/admin");
    expect(normalizeRoute("GET /api/v2/jobs/:id")).toBe("GET /api/v2/jobs/:id");
    expect(normalizeRoute("")).toBe("/");
  });
});

describe("recordError", () => {
  it("adds one row per kind and place, then counts repeats", async () => {
    const { sqlite, db } = errorsDb();
    const first = new Date("2026-10-16T12:00:00.000Z");
    const later = new Date("2026-10-16T12:05:00.000Z");
    await recordError(db, { source: "api", name: "TypeError", message: "x is undefined (row 1)", route: "GET /api/v2/jobs/:id", requestId: "ray-1" }, { now: first });
    await recordError(db, { source: "api", name: "TypeError", message: "x is undefined (row 2)", route: "GET /api/v2/jobs/:id" }, { now: later });
    await recordError(db, { source: "api", name: "TypeError", message: "x is undefined (row 3)", route: "POST /api/v2/jobs/:id/save" }, { now: later });

    const [repeated, elsewhere] = rows(sqlite);
    expect(repeated).toMatchObject({
      kind: "TypeError: x is undefined (row <n>)",
      route: "GET /api/v2/jobs/:id",
      message: "x is undefined (row 2)",
      count: 2,
      first_seen_at: first.toISOString(),
      last_seen_at: later.toISOString(),
      last_request_id: "ray-1",
      alerted_at: null,
    });
    expect(elsewhere).toMatchObject({ route: "POST /api/v2/jobs/:id/save", count: 1 });
  });

  it("only counts known kinds when new ones aren't allowed", async () => {
    const { sqlite, db } = errorsDb();
    await recordError(db, { source: "web", message: "known", route: "/" });
    expect(await recordError(db, { source: "web", message: "known", route: "/" }, { allowNew: false })).toBe(true);
    expect(await recordError(db, { source: "web", message: "brand new", route: "/" }, { allowNew: false })).toBe(false);
    expect(rows(sqlite).map((row) => [row.kind, row.count])).toEqual([["Error: known", 2]]);
  });

  it("never throws when the table is missing", async () => {
    const { db } = sqliteD1();
    expect(await recordError(db, { source: "cron", message: "boom", route: "poll" })).toBe(false);
  });
});

describe("alertNewErrors", () => {
  function recorder() {
    const alerts: NotificationPayload[] = [];
    return {
      alerts,
      alert: async (_db: D1Database, _env: Env, payload: NotificationPayload) => {
        alerts.push(payload);
        return 1;
      },
    };
  }

  it("announces each new kind once, in one push per tick", async () => {
    const { db } = errorsDb();
    const env = { DB: db } as Env;
    const { alerts, alert } = recorder();
    await recordError(db, { source: "api", name: "TypeError", message: "a is undefined", route: "GET /api/v2/jobs" }, { now: new Date("2026-10-16T12:00:00Z") });
    await recordError(db, { source: "ios", name: "Error", message: "Render failed", route: "/today" }, { now: new Date("2026-10-16T12:00:01Z") });

    expect(await alertNewErrors(env, new Date("2026-10-16T12:01:00Z"), alert)).toBe(2);
    await recordError(db, { source: "api", name: "TypeError", message: "a is undefined", route: "GET /api/v2/jobs" });
    expect(await alertNewErrors(env, new Date("2026-10-16T12:02:00Z"), alert)).toBe(0);

    expect(alerts).toEqual([{
      title: "2 new kinds of errors",
      body: "TypeError: a is undefined (API) · Error: Render failed (iPhone)",
      data: { url: "/admin" },
    }]);
  });

  it("stays quiet before the table exists", async () => {
    const { db } = sqliteD1();
    const { alerts, alert } = recorder();
    expect(await alertNewErrors({ DB: db } as Env, new Date(), alert)).toBe(0);
    expect(alerts).toEqual([]);
  });
});

describe("buildErrorAlertPayload", () => {
  it("names the error and where it happened", () => {
    expect(buildErrorAlertPayload([{ source: "cron", kind: "Error: D1_ERROR: database is locked", route: "poll" }])).toEqual({
      title: "New error in a cron",
      body: "Error: D1_ERROR: database is locked · poll",
      data: { url: "/admin" },
    });
  });

  it("lists two and counts the rest", () => {
    const payload = buildErrorAlertPayload([
      { source: "api", kind: "A", route: "/a" },
      { source: "web", kind: "B", route: "/b" },
      { source: "queue", kind: "C", route: "pinkslip-notify" },
    ]);
    expect(payload.body).toBe("A (API) · B (web) +1 more");
  });
});

describe("the Worker's error reporting", () => {
  it("records an unhandled API error under its route pattern and still answers 500", async () => {
    const { sqlite, db } = errorsDb();
    const { ctx, settle } = context();
    const response = await worker.fetch(
      new Request("https://pinkslip.work/api/v2/jobs?limit=5", { headers: { "cf-ray": "ray-123" } }),
      { DB: db } as Env,
      ctx
    );
    await settle();

    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ code: "internal_error", request_id: "ray-123" });
    const [row] = rows(sqlite);
    expect(row).toMatchObject({ source: "api", route: "GET /api/v2/jobs", count: 1, last_request_id: "ray-123" });
    expect(row!.kind).toContain("no such table");
  });

  function report(body: unknown, headers: Record<string, string> = {}) {
    return new Request("https://pinkslip.work/api/v2/errors", {
      method: "POST",
      headers: { "content-type": "application/json", "cf-connecting-ip": crypto.randomUUID(), ...headers },
      body: JSON.stringify(body),
    });
  }

  it("takes app reports without a session and without making a guest", async () => {
    const { sqlite, db } = errorsDb();
    const { ctx } = context();
    const env = { DB: db } as Env;

    const web = await worker.fetch(report({ name: "TypeError", message: "x is not a function", stack: "at Feed (feed.tsx:10)", route: "/jobs/stripe-7712345" }), env, ctx);
    const ios = await worker.fetch(report({ message: "Render failed", route: "/today", build: "1.3.2 (58)" }, { "x-pinkslip-client": "ios" }), env, ctx);

    expect(web.status).toBe(204);
    expect(web.headers.get("set-cookie")).toBeNull();
    expect(ios.status).toBe(204);
    expect(rows(sqlite).map((row) => [row.source, row.kind, row.route, row.last_build])).toEqual([
      ["web", "TypeError: x is not a function", "/jobs/:id", null],
      ["ios", "Error: Render failed", "/today", "1.3.2 (58)"],
    ]);
  });

  it("drops network failures, cancelled requests and extension noise", async () => {
    const { sqlite, db } = errorsDb();
    const { ctx } = context();
    const env = { DB: db } as Env;
    for (const body of [
      { name: "TypeError", message: "Failed to fetch", route: "/" },
      { name: "TypeError", message: "Network request failed", route: "/" },
      { name: "AbortError", message: "The operation was aborted", route: "/" },
      { name: "ApiError", message: "Not found", route: "/" },
      { name: "Error", message: "boom", stack: "at chrome-extension://abc/content.js:1", route: "/" },
    ]) {
      expect((await worker.fetch(report(body), env, ctx)).status).toBe(204);
    }
    expect(rows(sqlite)).toEqual([]);
  });

  it("rejects a report without a message", async () => {
    const { db } = errorsDb();
    const response = await worker.fetch(report({ name: "Error" }), { DB: db } as Env, context().ctx);
    expect(response.status).toBe(400);
  });

  it("stops adding new app kinds past the hourly cap but keeps counting known ones", async () => {
    const { sqlite, db } = errorsDb();
    const { ctx } = context();
    const env = { DB: db } as Env;
    for (let index = 0; index < NEW_APP_KINDS_PER_HOUR; index += 1) {
      await worker.fetch(report({ message: `distinct fault ${"abcdefghijklmnopqrstuvwxyz"[index]}`, route: "/" }), env, ctx);
    }
    await worker.fetch(report({ message: "one more new fault", route: "/" }), env, ctx);
    await worker.fetch(report({ message: "distinct fault a", route: "/" }), env, ctx);

    const all = rows(sqlite);
    expect(all).toHaveLength(NEW_APP_KINDS_PER_HOUR);
    expect(all.find((row) => row.kind === "Error: distinct fault a")?.count).toBe(2);
  });

  it("lists errors for admins only", async () => {
    const { db } = errorsDb();
    const response = await worker.fetch(new Request("https://pinkslip.work/api/v2/errors"), { DB: db } as Env, context().ctx);
    expect(response.status).not.toBe(200);
  });
});
