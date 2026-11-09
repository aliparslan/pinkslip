import { Database } from "bun:sqlite";
import { afterEach, describe, expect, it } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { createGuestSession } from "../worker/auth";
import worker from "../worker/index";
import type { Env } from "../worker/types";
import { sqliteD1 } from "./sqlite-d1";

const migrations = `${import.meta.dir}/../migrations/`;
const ORIGIN = "https://pinkslip.work";
const databases: Database[] = [];
afterEach(() => { for (const db of databases.splice(0)) db.close(); });

function setup() {
  const { sqlite, db } = sqliteD1();
  databases.push(sqlite);
  for (const file of readdirSync(migrations).filter((name) => name.endsWith(".sql")).sort()) sqlite.exec(readFileSync(`${migrations}${file}`, "utf8"));
  sqlite.exec("PRAGMA foreign_keys = ON");
  const mail: Array<{ to: string; text?: string; html?: string }> = [];
  const env = {
    DB: db,
    EMAIL: { send: async (message: { to: string; text?: string }) => { mail.push(message); } },
    EMAIL_FROM_ADDRESS: "login@pinkslip.work",
  } as unknown as Env;
  const ctx = { waitUntil() {}, passThroughOnException() {} } as unknown as ExecutionContext;
  const as = (token: string) => (path: string, body?: unknown) => worker.fetch(new Request(`${ORIGIN}/api/v2${path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json", "x-pinkslip-client": "ios" },
    body: JSON.stringify(body ?? {}),
  }), env, ctx);
  const newest = (to: string) => [...mail].reverse().find((message) => message.to === to);
  const code = (to: string) => newest(to)?.text?.match(/code is (\d{6})/)?.[1] ?? "";
  const link = (to: string) => `${newest(to)?.text}${newest(to)?.html}`.match(/token=([A-Za-z0-9_-]+)/)?.[1] ?? "";
  const users = () => (sqlite.query("SELECT id FROM users").all() as Array<{ id: string }>).map((row) => row.id);
  const guest = async () => (await createGuestSession(db)).id;
  async function account(email: string) {
    const call = as(await guest());
    await call("/auth/email/code/start", { email });
    const body = await (await call("/auth/email/code/verify", { email, code: code(email) })).json() as { native_token: string; user: { id: string } };
    return { token: body.native_token, userId: body.user.id };
  }
  return { sqlite, env, ctx, as, code, link, users, guest, account };
}

describe("signing in never costs anyone an account", () => {
  it("a sign-in link only works for the session that asked for it", async () => {
    const s = setup();
    const owner = await s.account("owner@example.com");
    const other = await s.account("other@example.com");
    s.sqlite.exec("DELETE FROM email_login_tokens");
    await s.as(other.token)("/auth/email/start", { email: "other@example.com" });
    const token = s.link("other@example.com");
    expect(token.length).toBeGreaterThan(20);

    expect((await s.as(owner.token)("/auth/email/verify", { token })).status).toBe(401);
    expect((await s.as(await s.guest())("/auth/email/verify", { token })).status).toBe(401);
    expect(s.users()).toEqual(expect.arrayContaining([owner.userId, other.userId]));
    expect(s.sqlite.query("SELECT COUNT(*) AS n FROM auth_identities WHERE user_id = ?").get(owner.userId)).toEqual({ n: 1 });
  });

  it("the same goes for a link opened in another signed-in browser", async () => {
    const s = setup();
    const owner = await s.account("owner@example.com");
    const other = await s.account("other@example.com");
    s.sqlite.exec("DELETE FROM email_login_tokens");
    await s.as(other.token)("/auth/email/start", { email: "other@example.com" });
    const opened = await worker.fetch(new Request(`${ORIGIN}/auth/email/verify?token=${s.link("other@example.com")}`, { headers: { cookie: `psid=${owner.token}` } }), s.env, s.ctx);
    expect(opened.headers.get("location")).toContain("auth=email-expired");
    expect(s.users()).toEqual(expect.arrayContaining([owner.userId, other.userId]));
  });

  it("a guest's own link still signs them in", async () => {
    const s = setup();
    const call = s.as(await s.guest());
    await call("/auth/email/start", { email: "new@example.com" });
    const done = await call("/auth/email/verify", { token: s.link("new@example.com") });
    expect(done.status).toBe(200);
    expect(await done.json()).toMatchObject({ session: { state: "authenticated" } });
  });

  it("a signed-in account asks you to sign out rather than merging into another", async () => {
    const s = setup();
    const owner = await s.account("owner@example.com");
    const other = await s.account("other@example.com");
    s.sqlite.exec("DELETE FROM email_login_tokens");
    const call = s.as(owner.token);
    await call("/auth/email/code/start", { email: "other@example.com" });
    const refused = await call("/auth/email/code/verify", { email: "other@example.com", code: s.code("other@example.com") });
    expect(refused.status).toBe(409);
    expect(await refused.json()).toMatchObject({ code: "signed_in_elsewhere" });
    expect(s.users()).toEqual(expect.arrayContaining([owner.userId, other.userId]));
  });

  it("a guest signing in still brings their things along", async () => {
    const s = setup();
    const owner = await s.account("owner@example.com");
    s.sqlite.exec("DELETE FROM email_login_tokens");
    const token = await s.guest();
    const guestId = (s.sqlite.query("SELECT user_id FROM auth_sessions WHERE id = ?").get(token) as { user_id: string }).user_id;
    const call = s.as(token);
    await call("/auth/email/code/start", { email: "owner@example.com" });
    const signedIn = await call("/auth/email/code/verify", { email: "owner@example.com", code: s.code("owner@example.com") });
    expect(signedIn.status).toBe(200);
    expect(await signedIn.json()).toMatchObject({ user: { id: owner.userId } });
    expect(s.users()).not.toContain(guestId);
  });
});

describe("guesses are counted before they're checked", () => {
  it("wrong codes arriving together stop at the limit", async () => {
    const s = setup();
    const call = s.as(await s.guest());
    await call("/auth/email/code/start", { email: "target@example.com" });
    const right = s.code("target@example.com");
    const guesses = Array.from({ length: 60 }, (_, index) => String(index).padStart(6, "0")).filter((guess) => guess !== right);
    const answers = await Promise.all(guesses.map(async (code) => (await (await call("/auth/email/code/verify", { email: "target@example.com", code })).json() as { code: string }).code));
    expect(answers.filter((answer) => answer === "wrong_code").length).toBe(5);
    expect(answers.filter((answer) => answer === "expired_code").length).toBe(guesses.length - 5);
    expect((await call("/auth/email/code/verify", { email: "target@example.com", code: right })).status).toBe(401);
  });

  it("the right code still works after a wrong one", async () => {
    const s = setup();
    const call = s.as(await s.guest());
    await call("/auth/email/code/start", { email: "target@example.com" });
    const right = s.code("target@example.com");
    expect((await call("/auth/email/code/verify", { email: "target@example.com", code: right === "000000" ? "000001" : "000000" })).status).toBe(401);
    expect((await call("/auth/email/code/verify", { email: "target@example.com", code: right })).status).toBe(200);
  });

  it("wrong passwords arriving together are limited, and a right one leaves no mark", async () => {
    const s = setup();
    const call = s.as(await s.guest());
    await call("/auth/email/code/start", { email: "pw@example.com" });
    await call("/auth/email/code/verify", { email: "pw@example.com", code: s.code("pw@example.com"), password: "correct horse battery staple" });
    const fresh = s.as(await s.guest());
    expect((await fresh("/auth/password/login", { email: "pw@example.com", password: "correct horse battery staple" })).status).toBe(200);
    expect(s.sqlite.query("SELECT COUNT(*) AS n FROM password_attempts").get()).toEqual({ n: 0 });
    const tries = await Promise.all(Array.from({ length: 25 }, async () => (await s.as(await s.guest())("/auth/password/login", { email: "pw@example.com", password: "wrong wrong wrong" })).status));
    expect(tries.filter((status) => status === 429).length).toBeGreaterThan(0);
    expect((s.sqlite.query("SELECT COUNT(*) AS n FROM password_attempts").get() as { n: number }).n).toBeLessThanOrEqual(10);
  });
});
