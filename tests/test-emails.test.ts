import { Database } from "bun:sqlite";
import { afterEach, describe, expect, it } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { handleInboundEmail } from "@worker/email/handler";
import { listInboundEmails } from "@worker/email/process";
import { clearTestEmails, runRequestedTestEmails, sendTestEmails } from "@worker/email/test-emails";
import { getOrCreateInbox } from "@worker/inbox";
import type { Env } from "@worker/types";
import { sqliteD1 } from "./sqlite-d1";

const migrationsDir = new URL("../migrations/", import.meta.url).pathname;
const databases: Database[] = [];
afterEach(() => {
  for (const db of databases.splice(0)) db.close();
});

function setup() {
  const { sqlite, db } = sqliteD1();
  databases.push(sqlite);
  for (const file of readdirSync(migrationsDir).filter((name) => name.endsWith(".sql")).sort()) {
    sqlite.exec(readFileSync(`${migrationsDir}${file}`, "utf8"));
  }
  sqlite.exec("PRAGMA foreign_keys = ON");
  // Ahead of every seeded company alphabetically, so the run picks it.
  sqlite.run(`INSERT INTO companies (id, name, ats_type, ats_slug, website)
    VALUES ('aaa', 'Aardvark Labs', 'greenhouse', 'aardvarklabs-test', 'https://aardvark.example')`);
  for (const [id, title, external] of [["j1", "Software Engineer, New Grad", "501"], ["j2", "Data Engineer", "502"], ["j3", "Product Designer", "503"]]) {
    sqlite.run(`INSERT INTO jobs (id, company_id, external_id, title, url, location, first_seen_at)
      VALUES (?, 'aaa', ?, ?, ?, 'New York, NY', ?)`, [id, external, title, `https://boards.greenhouse.io/aardvarklabs-test/jobs/${external}`, `2026-10-1${external.slice(-1)}T00:00:00Z`]);
  }
  sqlite.run("INSERT INTO users (id, role, time_zone) VALUES ('owner', 'admin', 'America/New_York')");
  sqlite.run("INSERT INTO push_subscriptions (id, endpoint, p256dh, auth, user_id, platform) VALUES ('p', 'token', '', '', 'owner', 'ios')");
  return { sqlite, db, env: { DB: db } as Env };
}

describe("test emails", () => {
  it("moves three real jobs through every step, asks which application, and hears a reply", async () => {
    const { sqlite, env } = setup();
    const run = await sendTestEmails(env, "owner", new Date("2026-10-20T14:00:00Z"));

    expect(run.company).toBe("Aardvark Labs");
    expect(run.emails.map((email) => email.outcome)).toEqual([
      "created", "created", "created", "applied", "applied", "applied", "needs_choice", "reply",
    ]);
    const stages = sqlite.query("SELECT title, stage, stage_date, stage_date_source FROM applications ORDER BY title").all();
    expect(stages).toEqual([
      { title: "Data Engineer", stage: "offer", stage_date: null, stage_date_source: null },
      // The newest job is A. The interview's calendar invite: 11 am in New York, two days out.
      { title: "Product Designer", stage: "interview", stage_date: "2026-10-22T15:00:00.000Z", stage_date_source: "email" },
      { title: "Software Engineer, New Grad", stage: "applied", stage_date: null, stage_date_source: null },
    ]);
    expect(sqlite.query("SELECT status FROM outreach_threads").get()).toEqual({ status: "replied" });
    expect(sqlite.query("SELECT kind, title FROM notification_log ORDER BY created_at, rowid").all()).toEqual([
      { kind: "application_moved", title: "Aardvark Labs" },
      { kind: "application_moved", title: "Aardvark Labs" },
      { kind: "application_moved", title: "Aardvark Labs" },
      { kind: "which_application", title: "Aardvark Labs" },
      { kind: "replied", title: "Marcus replied" },
    ]);
  });

  it("clears everything it made", async () => {
    const { sqlite, env } = setup();
    await sendTestEmails(env, "owner");
    expect(await clearTestEmails(env, "owner")).toBe(3);
    for (const table of ["applications", "inbound_emails", "outreach_threads", "company_contacts"]) {
      expect(sqlite.query(`SELECT COUNT(*) AS count FROM ${table}`).get()).toEqual({ count: 0 });
    }
  });

  it("runs from a request left for an admin, and never for anyone else", async () => {
    const { sqlite, env } = setup();
    sqlite.run("INSERT INTO users (id, role) VALUES ('someone', 'user')");
    sqlite.run("INSERT INTO preferences (key, value) VALUES ('test_emails:owner', 'send'), ('test_emails:someone', 'send')");
    expect(await runRequestedTestEmails(env)).toBe(1);
    expect(sqlite.query("SELECT COUNT(*) AS count FROM preferences WHERE key LIKE 'test_emails:%'").get()).toEqual({ count: 0 });
    expect(sqlite.query("SELECT COUNT(DISTINCT user_id) AS users FROM applications").get()).toEqual({ users: 1 });
  });
});

describe("forwarded mail and replies", () => {
  function message(to: string, raw: string): ForwardableEmailMessage {
    const bytes = new TextEncoder().encode(raw);
    const headers = new Headers();
    for (const line of raw.split("\r\n\r\n")[0]!.split("\r\n")) {
      const index = line.indexOf(":");
      headers.append(line.slice(0, index), line.slice(index + 1).trim());
    }
    return { from: "me@outlook.com", to, headers, raw: new Response(bytes).body!, rawSize: bytes.length } as unknown as ForwardableEmailMessage;
  }

  async function withThread(contactEmail: string) {
    const harness = setup();
    const now = new Date().toISOString();
    harness.sqlite.run("INSERT INTO company_contacts (id, company_id, email, name, source, created_at) VALUES ('cc', 'aaa', ?, '', 'test', ?)", [contactEmail, now]);
    harness.sqlite.run("INSERT INTO outreach_threads (id, user_id, company_id, contact_id, status, created_at, updated_at) VALUES ('t1', 'owner', 'aaa', 'cc', 'active', ?, ?)", [now, now]);
    const inbox = await getOrCreateInbox(harness.db, "owner");
    return { ...harness, send: (raw: string) => handleInboundEmail(message(inbox.address, raw), harness.env) };
  }

  it("doesn't take the user's own forward for a recruiter's reply", async () => {
    // The outreach test contact is the owner's own address, which is also where they forward from.
    const { sqlite, send } = await withThread("me@outlook.com");
    await send([
      "From: Me <me@outlook.com>", "Subject: Fwd: Thank you for applying to DoorDash", "Message-ID: <f1@outlook.com>",
      "Content-Type: text/plain; charset=utf-8", "",
      "---------- Forwarded message ---------\r\nFrom: DoorDash <no-reply@doordash.com>\r\nDate: Sat, Oct 17, 2026\r\nSubject: Thank you for applying to DoorDash\r\n\r\nThanks for applying.",
    ].join("\r\n"));
    expect(sqlite.query("SELECT status FROM outreach_threads").get()).toEqual({ status: "active" });
  });

  it("still hears a reply the user forwards by hand", async () => {
    const { sqlite, send } = await withThread("marcus@aardvark.example");
    await send([
      "From: Me <me@outlook.com>", "Subject: Fwd: Re: Hello", "Message-ID: <f2@outlook.com>",
      "Content-Type: text/plain; charset=utf-8", "",
      "---------- Forwarded message ---------\r\nFrom: Marcus Lee <marcus@aardvark.example>\r\nDate: Sat, Oct 17, 2026\r\nSubject: Re: Hello\r\n\r\nHappy to chat.",
    ].join("\r\n"));
    expect(sqlite.query("SELECT status FROM outreach_threads").get()).toEqual({ status: "replied" });
  });
});

describe("Job emails", () => {
  it("carries the company's site for its logo", async () => {
    const { env, db } = setup();
    await sendTestEmails(env, "owner");
    const emails = await listInboundEmails(db, "owner");
    expect(emails[0]).toMatchObject({ company_name: "Aardvark Labs", company_domain: "https://aardvark.example" });
  });
});
