import { Database } from "bun:sqlite";
import { afterEach, describe, expect, it } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { getApplicationDetail, trackJob, updateApplication } from "@worker/applications";
import { calendarStart, detectEmailDate } from "@worker/email/dates";
import { nudgeStoppedForwarding } from "@worker/email/forwarding";
import { handleInboundEmail } from "@worker/email/handler";
import { assignInboundEmail, processEmail } from "@worker/email/process";
import { EMAIL_AI_DAILY_LIMIT, readStageWithAi } from "@worker/email/stage-reader";
import { getOrCreateInbox } from "@worker/inbox";
import type { JevRunner } from "@worker/jev";
import type { Env } from "@worker/types";
import { sqliteD1 } from "./sqlite-d1";

const migrationsDir = new URL("../migrations/", import.meta.url).pathname;
const databases: Database[] = [];
afterEach(() => {
  for (const db of databases.splice(0)) db.close();
});

function mime(headers: Record<string, string>, body: string, calendar?: string): string {
  const head = Object.entries(headers).map(([key, value]) => `${key}: ${value}`).join("\r\n");
  if (!calendar) return `${head}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${body}`;
  return `${head}\r\nMIME-Version: 1.0\r\nContent-Type: multipart/mixed; boundary="b1"\r\n\r\n`
    + `--b1\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${body}\r\n`
    + `--b1\r\nContent-Type: text/calendar; method=REQUEST; charset=utf-8\r\nContent-Disposition: attachment; filename="invite.ics"\r\n\r\n${calendar}\r\n--b1--\r\n`;
}

function message(to: string, raw: string): ForwardableEmailMessage {
  const bytes = new TextEncoder().encode(raw);
  const headers = new Headers();
  for (const line of raw.split("\r\n\r\n")[0]!.split("\r\n")) {
    const index = line.indexOf(":");
    headers.append(line.slice(0, index), line.slice(index + 1).trim());
  }
  return { from: "forwarder@gmail.com", to, headers, raw: new Response(bytes).body!, rawSize: bytes.length } as unknown as ForwardableEmailMessage;
}

async function setup() {
  const { sqlite, db } = sqliteD1();
  databases.push(sqlite);
  for (const file of readdirSync(migrationsDir).filter((name) => name.endsWith(".sql")).sort()) {
    sqlite.exec(readFileSync(`${migrationsDir}${file}`, "utf8"));
  }
  sqlite.exec("PRAGMA foreign_keys = ON");
  sqlite.run("INSERT INTO users (id, time_zone) VALUES ('u1', 'America/New_York')");
  sqlite.run(`INSERT INTO companies (id, name, ats_type, ats_slug, website)
    VALUES ('zephyr', 'Zephyr Labs', 'greenhouse', 'zephyrlabs-test', 'https://zephyrlabs.example')`);
  for (const [id, title, externalId] of [["z1", "Software Engineer, New Grad", "9100001"], ["z2", "Software Engineer", "9100002"], ["z3", "Data Scientist", "9100003"]]) {
    sqlite.run(`INSERT INTO jobs (id, company_id, external_id, title, url, location)
      VALUES ('${id}', 'zephyr', '${externalId}', '${title}', 'https://boards.greenhouse.io/zephyrlabs-test/jobs/${externalId}', 'New York, NY')`);
  }
  const sent: Array<{ to: string; subject: string; text?: string }> = [];
  const env = {
    DB: db,
    EMAIL: { send: async (mail: { to: string; subject: string; text?: string }) => { sent.push(mail); } },
    EMAIL_FROM_ADDRESS: "hello@pinkslip.work",
  } as unknown as Env;
  const inbox = await getOrCreateInbox(db, "u1");
  const send = (raw: string) => handleInboundEmail(message(inbox.address, raw), env);
  const log = () => sqlite.query("SELECT kind, title, body, passive FROM notification_log ORDER BY created_at, rowid").all();
  const appId = (jobId: string) => (sqlite.query("SELECT id FROM applications WHERE job_id = ?").get(jobId) as { id: string }).id;
  return { sqlite, db, env, sent, send, log, appId, inbox };
}

const greenhouse = (subject: string, body: string, messageId: string, calendar?: string) => mime({
  From: "Zephyr Labs <no-reply@us.greenhouse-mail.io>",
  To: "alex@gmail.com",
  Subject: subject,
  "Message-ID": `<${messageId}@greenhouse>`,
  Date: "Tue, 20 Oct 2026 14:00:00 +0000",
}, body, calendar);

const invite = [
  "BEGIN:VCALENDAR", "VERSION:2.0", "METHOD:REQUEST", "BEGIN:VEVENT",
  "DTSTART;TZID=America/New_York:20261022T110000", "SUMMARY:Zephyr Labs Interview", "END:VEVENT", "END:VCALENDAR",
].join("\r\n");

describe("they replied (N11)", () => {
  async function withThread() {
    const harness = await setup();
    const now = new Date().toISOString();
    harness.sqlite.run("INSERT INTO company_contacts (id, company_id, email, name, source, created_at) VALUES ('cc', 'zephyr', 'Marcus.Lee@zephyr.example', 'Marcus Lee', 'test', ?)", [now]);
    harness.sqlite.run("INSERT INTO outreach_threads (id, user_id, company_id, job_id, contact_id, status, created_at, updated_at) VALUES ('t1', 'u1', 'zephyr', 'z1', 'cc', 'active', ?, ?)", [now, now]);
    harness.sqlite.run("INSERT INTO outreach_messages (id, thread_id, step, subject, body, status, due_at, created_at, updated_at) VALUES ('m0', 't1', 0, 'Hi', 'Hi', 'sent', NULL, ?, ?), ('m1', 't1', 1, 'Following up', 'Hi', 'scheduled', '2026-12-01T14:00:00Z', ?, ?)", [now, now, now, now]);
    return harness;
  }

  it("marks the thread replied, stops its follow-ups and pushes it time-sensitive", async () => {
    const { sqlite, send, log } = await withThread();
    await send(mime({ From: "Marcus Lee <marcus.lee@zephyr.example>", Subject: "Re: Hello from Alex", "Message-ID": "<r1@zephyr>" }, "Hi Alex, happy to chat. How's Thursday?"));

    expect(sqlite.query("SELECT status FROM outreach_threads").get()).toEqual({ status: "replied" });
    expect(sqlite.query("SELECT status FROM outreach_messages WHERE id = 'm1'").get()).toEqual({ status: "skipped" });
    expect(sqlite.query("SELECT kind, source FROM activity WHERE kind = 'replied'").all()).toEqual([{ kind: "replied", source: "email" }]);
    expect(log()).toEqual([{ kind: "replied", title: "Marcus replied", body: "Zephyr Labs · Software Engineer, New Grad", passive: 0 }]);
    // Nothing of the email is kept.
    expect(sqlite.query("SELECT COUNT(*) AS count FROM inbound_emails").get()).toEqual({ count: 0 });
  });

  it("ignores mail from anyone else", async () => {
    const { sqlite, send } = await withThread();
    await send(mime({ From: "Someone <someone@zephyr.example>", Subject: "Hello", "Message-ID": "<r2@zephyr>" }, "Hi"));
    expect(sqlite.query("SELECT status FROM outreach_threads").get()).toEqual({ status: "active" });
  });
});

describe("dates from emails", () => {
  it("reads a calendar invite's start in its own zone", () => {
    expect(calendarStart(invite)).toEqual({ value: "2026-10-22T15:00:00.000Z" });
    expect(calendarStart("BEGIN:VEVENT\r\nDTSTART;VALUE=DATE:20261022\r\nEND:VEVENT")).toEqual({ value: "2026-10-22" });
    expect(calendarStart("BEGIN:VEVENT\r\nDTSTART:20261022T150000Z\r\nEND:VEVENT")).toEqual({ value: "2026-10-22T15:00:00.000Z" });
  });

  it("keeps only the day when a time comes without a zone", () => {
    expect(detectEmailDate({ subject: "Interview", text: "Your interview is confirmed for October 22 at 11:00 AM.", date: null }, "interview", "America/New_York"))
      .toEqual({ value: "2026-10-22" });
  });

  it("sets the interview's time from the invite, from the email, and records it", async () => {
    const { db, sqlite, send, appId } = await setup();
    await trackJob(db, "u1", "z1", "applied");
    await send(greenhouse("Interview Confirmation: Software Engineer, New Grad", "Your interview has been scheduled.", "invite-1", invite));

    const detail = await getApplicationDetail(db, "u1", appId("z1"));
    expect(detail).toMatchObject({ stage: "interview", stage_date: "2026-10-22T15:00:00.000Z", stage_date_source: "email" });
    expect(sqlite.query("SELECT kind, source FROM activity WHERE kind = 'date_set'").all()).toEqual([{ kind: "date_set", source: "email" }]);
    expect(sqlite.query("SELECT detected_by, detected_date FROM inbound_emails").get()).toEqual({ detected_by: "rules", detected_date: "2026-10-22T15:00:00.000Z" });
  });

  it("never replaces a date the person set", async () => {
    const { db, send, appId } = await setup();
    await trackJob(db, "u1", "z1", "interview");
    await updateApplication(db, "u1", appId("z1"), { stage_date: "2026-10-23T18:00:00.000Z" });
    await send(greenhouse("Interview Confirmation: Software Engineer, New Grad", "Your interview has been scheduled.", "invite-2", invite));
    expect(await getApplicationDetail(db, "u1", appId("z1"))).toMatchObject({ stage_date: "2026-10-23T18:00:00.000Z", stage_date_source: null });
  });

  it("keeps the date of an email that waits for 'Which application?' until it's answered", async () => {
    const { db, sqlite, send, appId } = await setup();
    await trackJob(db, "u1", "z2", "applied");
    await trackJob(db, "u1", "z3", "applied");
    await send(greenhouse("Update from Zephyr Labs", "We'd like to invite you to a phone screen.", "invite-3", invite));
    const email = sqlite.query("SELECT id, status, detected_date FROM inbound_emails").get() as { id: string; status: string; detected_date: string };
    expect(email).toMatchObject({ status: "needs_choice", detected_date: "2026-10-22T15:00:00.000Z" });

    await assignInboundEmail(db, "u1", email.id, [appId("z3")]);
    expect(await getApplicationDetail(db, "u1", appId("z3"))).toMatchObject({ stage: "interview", stage_date: "2026-10-22T15:00:00.000Z", stage_date_source: "email" });
  });
});

describe("the AI fallback", () => {
  function fakeAi(choice: string, probability = 0.95) {
    const calls: unknown[] = [];
    const ai: JevRunner = {
      async run(_model, inputs) {
        calls.push(inputs);
        return { model: "jev-1.13.2", id: "req", usage: { input_tokens: 1000, output_tokens: 3 }, answers: { stage: { choice, probabilities: { [choice]: probability } } } };
      },
    };
    return { ai, calls };
  }
  const unclear = {
    from: { name: "Zephyr Labs", address: "no-reply@us.greenhouse-mail.io" },
    subject: "A note about your candidacy",
    date: null,
    text: "Hi Alex, the hiring team enjoyed your conversation and would like to continue the process with you.",
    links: [],
  };

  it("reads a step the rules couldn't, within the budget, and records the cost", async () => {
    const { sqlite, env } = await setup();
    const { ai, calls } = fakeAi("interview");
    expect(await readStageWithAi(env, unclear, new Date("2026-10-20T14:00:00Z"), ai)).toBe("interview");
    expect(calls).toHaveLength(1);
    expect(sqlite.query("SELECT email_calls, reported_cost_usd FROM classification_daily_budget").get())
      .toEqual({ email_calls: 1, reported_cost_usd: 0.000042 });
  });

  it("takes no step when unsure or when it says none", async () => {
    const { env } = await setup();
    expect(await readStageWithAi(env, unclear, new Date(), fakeAi("none").ai)).toBeNull();
    expect(await readStageWithAi(env, unclear, new Date(), fakeAi("offer", 0.4).ai)).toBeNull();
  });

  it("stops at the monthly budget and the daily limit without calling", async () => {
    const { sqlite, env } = await setup();
    const { ai, calls } = fakeAi("interview");
    sqlite.run("INSERT INTO classification_daily_budget (day, calls, reported_cost_usd, email_calls) VALUES ('2026-10-01', 0, 10, 0)");
    expect(await readStageWithAi(env, unclear, new Date("2026-10-20T14:00:00Z"), ai)).toBeNull();
    sqlite.run("DELETE FROM classification_daily_budget");
    sqlite.run("INSERT INTO classification_daily_budget (day, calls, reported_cost_usd, email_calls) VALUES ('2026-10-20', 0, 0, ?)", [EMAIL_AI_DAILY_LIMIT]);
    expect(await readStageWithAi(env, unclear, new Date("2026-10-20T14:00:00Z"), ai)).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it("records a step the fallback read as read by AI", async () => {
    const { db, sqlite } = await setup();
    await trackJob(db, "u1", "z1", "applied");
    await processEmail(db, "u1", { ...unclear, subject: "A note about your Software Engineer, New Grad candidacy" }, "hash-ai", new Date().toISOString(), async () => "interview");
    expect(sqlite.query("SELECT detected_stage, detected_by FROM inbound_emails").get()).toEqual({ detected_stage: "interview", detected_by: "ai" });
  });
});

describe("forwarding stopped (N18)", () => {
  function inboxState(sqlite: Database, count: number, firstDaysAgo: number, lastDaysAgo: number, now: Date) {
    const ago = (days: number) => new Date(now.getTime() - days * 86_400_000).toISOString();
    sqlite.run("UPDATE email_inboxes SET email_count = ?, first_email_at = ?, last_email_at = ?, forwarding_nudged_at = NULL", [count, ago(firstDaysAgo), ago(lastDaysAgo)]);
  }

  it("emails once after 3 weeks of silence from someone who forwards everything", async () => {
    const { sqlite, env, sent, inbox } = await setup();
    sqlite.run(`INSERT INTO auth_identities (id, user_id, provider, provider_subject, email, email_verified, created_at)
      VALUES ('i1', 'u1', 'email', 'alex@gmail.com', 'alex@gmail.com', 1, '2026-10-01T00:00:00Z')`);
    const now = new Date("2026-10-20T14:00:00Z");
    inboxState(sqlite, 120, 50, 22, now);

    expect(await nudgeStoppedForwarding(env, now)).toBe(1);
    expect(await nudgeStoppedForwarding(env, new Date(now.getTime() + 86_400_000))).toBe(0);
    expect(sent).toEqual([expect.objectContaining({ to: "alex@gmail.com", subject: "Your job emails stopped reaching Pinkslip" })]);
    expect(sent[0]!.text).toContain(inbox.address);
    expect(sqlite.query("SELECT kind FROM notification_log").all()).toEqual([{ kind: "forwarding_stopped" }]);
  });

  it("leaves a quiet job-only filter alone, and anyone heard from lately", async () => {
    const { sqlite, env, sent } = await setup();
    sqlite.run(`INSERT INTO auth_identities (id, user_id, provider, provider_subject, email, email_verified, created_at)
      VALUES ('i1', 'u1', 'email', 'alex@gmail.com', 'alex@gmail.com', 1, '2026-10-01T00:00:00Z')`);
    const now = new Date("2026-10-20T14:00:00Z");
    inboxState(sqlite, 12, 60, 25, now);
    expect(await nudgeStoppedForwarding(env, now)).toBe(0);
    inboxState(sqlite, 120, 50, 5, now);
    expect(await nudgeStoppedForwarding(env, now)).toBe(0);
    expect(sent).toEqual([]);
  });
});
