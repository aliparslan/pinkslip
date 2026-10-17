import { Database } from "bun:sqlite";
import { afterEach, describe, expect, it } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import {
  HEALTH_CRON_SCHEDULE,
  runHealthChecks,
  type HealthCheckDeps,
} from "@worker/health-checks";
import worker, { scheduledCycle } from "@worker/index";
import type { NotificationPayload, PushResult } from "@worker/push";
import type { Env } from "@worker/types";
import { sqliteD1 } from "./sqlite-d1";

const migrationsDir = new URL("../migrations/", import.meta.url).pathname;
const databases: Database[] = [];
afterEach(() => {
  for (const db of databases.splice(0)) db.close();
});

const NOW = new Date("2026-10-16T12:07:00.000Z");
const hoursLater = (hours: number) => new Date(NOW.getTime() + hours * 60 * 60 * 1000);

function setup(options: { adminPhone?: boolean } = {}) {
  const { sqlite, db } = sqliteD1();
  databases.push(sqlite);
  for (const file of readdirSync(migrationsDir).filter((name) => name.endsWith(".sql")).sort()) {
    sqlite.exec(readFileSync(`${migrationsDir}${file}`, "utf8"));
  }
  sqlite.exec("PRAGMA foreign_keys = ON");
  sqlite.run("INSERT INTO users (id, role) VALUES ('owner', 'admin')");
  if (options.adminPhone !== false) {
    sqlite.run(`INSERT INTO push_subscriptions (id, endpoint, p256dh, auth, user_id, platform)
      VALUES ('phone', 'owner-device-token', '', '', 'owner', 'ios')`);
  }
  const env = {
    DB: db,
    APNS_KEY_ID: "KEY",
    APNS_TEAM_ID: "TEAM",
    APNS_BUNDLE_ID: "dev.alip.pinkslip",
    APNS_PRIVATE_KEY: "not used: pushes are faked",
  } as Env;

  const site = { feed: 200, feedJobs: 5, apple: 200 };
  const pushes: string[] = [];
  let pushResult: PushResult = { ok: true, status: 200 };
  const alerts: NotificationPayload[] = [];
  const emails: NotificationPayload[] = [];
  const pending: Promise<unknown>[] = [];
  const ctx = { waitUntil: (promise: Promise<unknown>) => pending.push(promise), passThroughOnException() {} } as unknown as ExecutionContext;

  const deps: HealthCheckDeps = {
    fetchApi: async (path, init) => worker.fetch(new Request(new URL(path, "https://pinkslip.work"), init), env, ctx),
    fetchExternal: (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "https://pinkslip.work/api/v2/jobs?limit=5") {
        return Response.json({ jobs: Array.from({ length: site.feedJobs }, (_, index) => ({ id: `j${index}` })) }, { status: site.feed });
      }
      if (url === "https://appleid.apple.com/auth/keys") {
        return Response.json({ keys: [{ kid: "a" }] }, { status: site.apple });
      }
      throw new Error(`Unexpected fetch ${url}`);
    }) as typeof fetch,
    sendSilentPush: async (token) => {
      pushes.push(token);
      return pushResult;
    },
    alert: async (_db, _env, payload) => {
      alerts.push(payload);
      return 1;
    },
    email: async (_env, payload) => {
      emails.push(payload);
      return 1;
    },
    sleep: async () => undefined,
  };
  return {
    sqlite,
    env,
    deps,
    site,
    pushes,
    alerts,
    emails,
    failPush(result: PushResult) {
      pushResult = result;
    },
    settle: () => Promise.all(pending),
  };
}

describe("runHealthChecks", () => {
  it("passes the feed, sign-in and push, and leaves no guest behind", async () => {
    const harness = setup();
    const usersBefore = harness.sqlite.query("SELECT COUNT(*) AS count FROM users").get() as { count: number };

    const health = await runHealthChecks(harness.env, harness.deps, NOW);
    await harness.settle();

    expect(health.results.map((result) => [result.name, result.ok, result.detail])).toEqual([
      ["feed", true, "5 jobs from pinkslip.work"],
      ["sign_in", true, "Guest session, account and Apple's keys"],
      ["push", true, "APNs accepted a silent push"],
    ]);
    expect(health.signature).toBe("");
    expect(harness.pushes).toEqual(["owner-device-token"]);
    expect(harness.alerts).toEqual([]);
    const usersAfter = harness.sqlite.query("SELECT COUNT(*) AS count FROM users").get() as { count: number };
    expect(usersAfter.count).toBe(usersBefore.count);
    expect(harness.sqlite.query("SELECT COUNT(*) AS count FROM auth_sessions").get()).toEqual({ count: 0 });
    const stored = harness.sqlite.query("SELECT value FROM preferences WHERE key = 'health_checks'").get() as { value: string };
    expect(JSON.parse(stored.value)).toMatchObject({ ranAt: NOW.toISOString(), signature: "" });
  });

  it("alerts once when the feed fails, repeats after 6 hours, then says when it recovers", async () => {
    const harness = setup();
    harness.site.feed = 500;

    await runHealthChecks(harness.env, harness.deps, NOW);
    await runHealthChecks(harness.env, harness.deps, hoursLater(1));
    await runHealthChecks(harness.env, harness.deps, hoursLater(6));
    harness.site.feed = 200;
    await runHealthChecks(harness.env, harness.deps, hoursLater(6.25));
    await runHealthChecks(harness.env, harness.deps, hoursLater(6.5));

    expect(harness.alerts).toEqual([
      { title: "Feed check failed", body: "HTTP 500", data: { url: "/admin" } },
      { title: "Feed check still failing", body: "HTTP 500", data: { url: "/admin" } },
      { title: "Checks pass again", body: "Feed, sign-in and push all work.", data: { url: "/admin" } },
    ]);
    // Push still worked, so nothing went by email.
    expect(harness.emails).toEqual([]);
  });

  it("counts an empty feed as a failure", async () => {
    const harness = setup();
    harness.site.feedJobs = 0;
    const health = await runHealthChecks(harness.env, harness.deps, NOW);
    expect(health.results[0]).toMatchObject({ name: "feed", ok: false, detail: "The feed came back empty" });
  });

  it("emails as well as pushing when push is what broke", async () => {
    const harness = setup();
    harness.failPush({ ok: false, status: 403, body: JSON.stringify({ reason: "InvalidProviderToken" }) });

    const health = await runHealthChecks(harness.env, harness.deps, NOW);
    harness.failPush({ ok: true, status: 200 });
    await runHealthChecks(harness.env, harness.deps, hoursLater(0.25));

    expect(health.results[2]).toMatchObject({ name: "push", ok: false, detail: "APNs 403: InvalidProviderToken" });
    // Tried twice before it counted.
    expect(harness.pushes).toHaveLength(3);
    const failed = { title: "Push check failed", body: "APNs 403: InvalidProviderToken", data: { url: "/admin" } };
    const recovered = { title: "Checks pass again", body: "Feed, sign-in and push all work.", data: { url: "/admin" } };
    expect(harness.alerts).toEqual([failed, recovered]);
    expect(harness.emails).toEqual([failed, recovered]);
  });

  it("emails when no admin phone took the push", async () => {
    const harness = setup();
    harness.site.apple = 503;
    harness.deps.alert = async () => 0;
    await runHealthChecks(harness.env, harness.deps, NOW);
    expect(harness.emails).toEqual([
      { title: "Sign-in check failed", body: "Apple's sign-in keys: HTTP 503", data: { url: "/admin" } },
    ]);
  });

  it("alerts again when a different set of checks fails", async () => {
    const harness = setup();
    harness.site.feed = 500;
    await runHealthChecks(harness.env, harness.deps, NOW);
    harness.site.apple = 503;
    await runHealthChecks(harness.env, harness.deps, hoursLater(0.25));

    expect(harness.alerts.map((alert) => alert.title)).toEqual(["Feed check failed", "2 checks failed"]);
    expect(harness.alerts[1]!.body).toBe("Feed: HTTP 500 · Sign-in: Apple's sign-in keys: HTTP 503");
  });

  it("retries a failing check once before it counts", async () => {
    const harness = setup();
    let calls = 0;
    const external = harness.deps.fetchExternal!;
    harness.deps.fetchExternal = (async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes("/api/v2/jobs") && calls++ === 0) return new Response("", { status: 502 });
      return external(input, init);
    }) as typeof fetch;

    const health = await runHealthChecks(harness.env, harness.deps, NOW);
    expect(health.results[0]).toMatchObject({ name: "feed", ok: true });
    expect(harness.alerts).toEqual([]);
  });

  it("fails push when no admin iPhone is registered", async () => {
    const harness = setup({ adminPhone: false });
    const health = await runHealthChecks(harness.env, harness.deps, NOW);
    expect(health.results[2]).toMatchObject({ name: "push", ok: false, detail: "No admin iPhone is registered for push" });
  });

  it("skips guest sign-in while an invite code is required", async () => {
    const harness = setup();
    harness.env.ACCESS_CODE = "letmein";
    const health = await runHealthChecks(harness.env, harness.deps, NOW);
    expect(health.results[1]).toMatchObject({ name: "sign_in", ok: true, detail: "Invite code is on; guest sign-in skipped" });
  });
});

describe("the health cron", () => {
  it("has its own schedule", () => {
    expect(scheduledCycle(HEALTH_CRON_SCHEDULE)).toBe("health");
  });

  it("is in wrangler.toml", () => {
    const config = readFileSync(new URL("../wrangler.toml", import.meta.url).pathname, "utf8");
    expect(config).toContain(`"${HEALTH_CRON_SCHEDULE}"`);
  });
});
