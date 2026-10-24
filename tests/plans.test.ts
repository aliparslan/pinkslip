import { Database } from "bun:sqlite";
import { afterEach, describe, expect, it } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { createGuestSession } from "@worker/auth";
import worker from "@worker/index";
import { allowanceWindow, currentPlan, mergeGuestPlan, planState, releaseAllowance, reserveAllowance, setPlanByAdmin } from "@worker/plans";
import { reserveAppTailorQuota } from "@worker/tailor/usage";
import type { Env } from "@worker/types";
import { sqliteD1 } from "./sqlite-d1";

const migrationsDir = new URL("../migrations/", import.meta.url).pathname;
const databases: Database[] = [];
afterEach(() => {
  for (const db of databases.splice(0)) db.close();
});

/** Saturday, October 24, 2026, 11am in New York. */
const SATURDAY = new Date("2026-10-24T15:00:00Z");

function setup() {
  const { sqlite, db } = sqliteD1();
  databases.push(sqlite);
  for (const file of readdirSync(migrationsDir).filter((name) => name.endsWith(".sql")).sort()) {
    sqlite.exec(readFileSync(`${migrationsDir}${file}`, "utf8"));
  }
  sqlite.exec("PRAGMA foreign_keys = ON");
  const mail: Array<{ to: string; text?: string }> = [];
  const env = {
    DB: db,
    EMAIL: { send: async (message: { to: string; text?: string }) => { mail.push(message); } },
    EMAIL_FROM_ADDRESS: "login@pinkslip.work",
  } as unknown as Env;
  const ctx = { waitUntil() {}, passThroughOnException() {} } as unknown as ExecutionContext;
  const app = (token: string) => (path: string, body?: unknown, method = "POST") => worker.fetch(new Request(`https://pinkslip.work${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json", "x-pinkslip-client": "ios" },
    body: body === undefined ? undefined : JSON.stringify(body),
  }), env, ctx);
  const guest = async () => {
    const session = await createGuestSession(db);
    return { token: session.id, userId: session.user_id, call: app(session.id) };
  };
  const signedIn = async (email: string, role: "user" | "admin" = "user") => {
    const start = await guest();
    await start.call("/api/v2/auth/email/code/start", { email });
    const code = mail.at(-1)?.text?.match(/code is (\d{6})/)?.[1] ?? "";
    const { native_token: token } = await (await start.call("/api/v2/auth/email/code/verify", { email, code })).json() as { native_token: string };
    const userId = (sqlite.query("SELECT user_id FROM auth_identities WHERE provider_subject = ?").get(email) as { user_id: string }).user_id;
    if (role === "admin") sqlite.run("UPDATE users SET role = 'admin' WHERE id = ?", [userId]);
    return { token, userId, call: app(token) };
  };
  return { sqlite, db, env, guest, signedIn };
}

describe("allowance windows", () => {
  it("start at local midnight for a day and Monday's for a week", () => {
    expect(allowanceWindow("day", "America/New_York", SATURDAY)).toEqual({
      since: "2026-10-24T04:00:00.000Z", resetsAt: "2026-10-25T04:00:00.000Z",
    });
    expect(allowanceWindow("week", "America/New_York", SATURDAY)).toEqual({
      since: "2026-10-19T04:00:00.000Z", resetsAt: "2026-10-26T04:00:00.000Z",
    });
  });

  it("follow the clocks changing", () => {
    // New York leaves daylight time on Sunday, November 1, 2026.
    expect(allowanceWindow("week", "America/New_York", new Date("2026-10-28T15:00:00Z"))).toEqual({
      since: "2026-10-26T04:00:00.000Z", resetsAt: "2026-11-02T05:00:00.000Z",
    });
  });
});

describe("plans", () => {
  it("start everyone on Free with 3 sends and 3 tailored resumes a week, and the trial", async () => {
    const { env, guest } = setup();
    const { userId } = await guest();
    const state = await planState(env, userId, SATURDAY);
    expect(state).toMatchObject({
      plan: "free", source: null, period: null, ends_at: null, will_renew: false,
      trial: { available: true, days: 3 }, prices: { currency: "usd", week: 5, month: 15 },
    });
    expect(state.allowances.map(({ kind, used, limit, per, quiet }) => ({ kind, used, limit, per, quiet }))).toEqual([
      { kind: "auto_apply_send", used: 0, limit: 3, per: "week", quiet: false },
      { kind: "tailoring", used: 0, limit: 3, per: "week", quiet: false },
    ]);
  });

  it("give Pro 10 sends a day and a quiet tailoring ceiling, until Pro ends", async () => {
    const { env, db, guest } = setup();
    const { userId } = await guest();
    await setPlanByAdmin(db, userId, "pro", "2026-10-31T00:00:00.000Z", SATURDAY);
    const pro = await planState(env, userId, SATURDAY);
    expect(pro).toMatchObject({ plan: "pro", source: "admin", ends_at: "2026-10-31T00:00:00.000Z" });
    expect(pro.allowances.map(({ kind, limit, per, quiet }) => ({ kind, limit, per, quiet }))).toEqual([
      { kind: "auto_apply_send", limit: 10, per: "day", quiet: false },
      { kind: "tailoring", limit: 50, per: "week", quiet: true },
    ]);
    expect((await currentPlan(env, userId, new Date("2026-11-01T00:00:00Z"))).plan).toBe("free");
    await setPlanByAdmin(db, userId, "free", null, SATURDAY);
    expect((await currentPlan(env, userId, SATURDAY)).plan).toBe("free");
  });

  it("count auto-apply sends atomically, and a failed send gives its use back", async () => {
    const { env, db, guest } = setup();
    const { userId } = await guest();
    const sends = [];
    for (let index = 0; index < 3; index += 1) sends.push(await reserveAllowance(env, userId, "auto_apply_send", `job-${index}`, SATURDAY));
    expect(sends.every((send) => send.ok)).toBe(true);
    expect(await reserveAllowance(env, userId, "auto_apply_send", "job-3", SATURDAY)).toEqual({ ok: false, limit: 3, resets_at: "2026-10-26T04:00:00.000Z" });
    await releaseAllowance(db, (sends[0] as { id: string }).id, SATURDAY);
    expect((await reserveAllowance(env, userId, "auto_apply_send", "job-3", SATURDAY)).ok).toBe(true);
    // A new week starts Monday.
    expect((await reserveAllowance(env, userId, "auto_apply_send", "job-4", new Date("2026-10-26T15:00:00Z"))).ok).toBe(true);
  });

  it("carry a guest's Pro and used trial over when they sign in", async () => {
    const { env, db, sqlite, guest } = setup();
    const first = await guest();
    const account = await guest();
    await setPlanByAdmin(db, first.userId, "pro", "2026-11-24T00:00:00.000Z", SATURDAY);
    sqlite.run("UPDATE user_plans SET trial_used_at = ? WHERE user_id = ?", [SATURDAY.toISOString(), first.userId]);
    await reserveAllowance(env, first.userId, "auto_apply_send", "job-1", SATURDAY);
    await mergeGuestPlan(db, first.userId, account.userId, SATURDAY);
    const merged = await planState(env, account.userId, SATURDAY);
    expect(merged).toMatchObject({ plan: "pro", ends_at: "2026-11-24T00:00:00.000Z", trial: { available: false } });
    expect(merged.allowances[0]?.used).toBe(1);
    expect(sqlite.query("SELECT COUNT(*) AS count FROM user_plans WHERE user_id = ?").get(first.userId)).toEqual({ count: 0 });
  });

  it("let tailoring use the plan's weekly allowance", async () => {
    const { db, guest } = setup();
    const { userId } = await guest();
    const allowance = { limit: 3, since: "2026-10-19T04:00:00.000Z", resetsAt: "2026-10-26T04:00:00.000Z" };
    for (let index = 0; index < 3; index += 1) expect((await reserveAppTailorQuota(db, userId, "@cf/zai-org/glm-4.7-flash", allowance)).ok).toBe(true);
    expect(await reserveAppTailorQuota(db, userId, "@cf/zai-org/glm-4.7-flash", allowance)).toEqual({ ok: false, resets_at: "2026-10-26T04:00:00.000Z" });
  });
});

describe("the plan routes", () => {
  it("show anyone their plan, and let only an admin give Pro by email", async () => {
    const { guest, signedIn } = setup();
    const visitor = await guest();
    const plan = await visitor.call("/api/v2/plan", undefined, "GET");
    expect(plan.status).toBe(200);
    expect(await plan.json() as unknown).toMatchObject({ plan: "free", trial: { available: true } });

    const tester = await signedIn("tester@example.com");
    expect((await tester.call("/api/v2/plan/admin", { email: "tester@example.com", plan: "pro" }, "PUT")).status).toBe(403);

    const owner = await signedIn("owner@example.com", "admin");
    expect((await owner.call("/api/v2/plan/admin", { email: "nobody@example.com", plan: "pro" }, "PUT")).status).toBe(404);
    expect((await owner.call("/api/v2/plan/admin", { email: "tester@example.com", plan: "gold" }, "PUT")).status).toBe(400);
    const given = await owner.call("/api/v2/plan/admin", { email: "Tester@Example.com", plan: "pro" }, "PUT");
    expect(given.status).toBe(200);
    expect(await given.json() as unknown).toMatchObject({ user_id: tester.userId, plan: "pro", source: "admin", ends_at: null });
    expect(await (await tester.call("/api/v2/plan", undefined, "GET")).json() as unknown).toMatchObject({ plan: "pro" });
  });
});
