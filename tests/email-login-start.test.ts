import { describe, expect, it } from "bun:test";
import { Hono } from "hono";
import authRoutes from "../worker/routes/auth";
import { sqliteD1 } from "./sqlite-d1";

// A failed send must not leave a token behind: the 60-second cooldown would
// then answer the retry with "ok" and send nothing (the owner saw exactly
// this: the first try failed, the second "succeeded", no email arrived).

async function setup(send: () => Promise<void>) {
  const { db, sqlite } = sqliteD1();
  sqlite.exec(`CREATE TABLE email_login_tokens (
    id TEXT PRIMARY KEY, email TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE, expires_at TEXT NOT NULL,
    consumed_at TEXT, redirect_uri TEXT, request_ip TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')))`);
  const sent: unknown[] = [];
  const env = {
    DB: db,
    EMAIL: { send: async (message: unknown) => { sent.push(message); await send(); } },
    EMAIL_FROM_ADDRESS: "login@pinkslip.work",
  };
  const app = new Hono().route("/api/v2/auth", authRoutes as unknown as Hono);
  const start = () => app.fetch(new Request("https://pinkslip.work/api/v2/auth/email/start", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "avery@example.com" }),
  }), env);
  const tokens = () => (sqlite.query("SELECT COUNT(*) AS count FROM email_login_tokens").get() as { count: number }).count;
  return { start, tokens, sent };
}

describe("email sign-in start", () => {
  it("sends the link and keeps its token", async () => {
    const { start, tokens, sent } = await setup(async () => undefined);
    const response = await start();
    expect(response.status).toBe(200);
    expect(sent).toHaveLength(1);
    expect(tokens()).toBe(1);
  });

  it("reports a failed send and lets the retry send for real", async () => {
    let fail = true;
    const { start, tokens, sent } = await setup(async () => {
      if (fail) throw new Error("E_SENDER_NOT_VERIFIED");
    });
    const failed = await start();
    expect(failed.status).toBe(503);
    expect(await failed.json()).toMatchObject({ code: "email_unavailable" });
    expect(tokens()).toBe(0);

    fail = false;
    const retry = await start();
    expect(retry.status).toBe(200);
    expect(sent).toHaveLength(2);
    expect(tokens()).toBe(1);
  });
});
