import { Database } from "bun:sqlite";
import { afterEach, describe, expect, it } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { handleInboundEmail } from "@worker/email/handler";
import { isAutoReply, isBounce, saysTheyLeft } from "@worker/email/bounces";
import { getOrCreateInbox } from "@worker/inbox";
import { importContacts, parseContactCsv, rejectContact, removeContactEmail } from "@worker/outreach/contact-admin";
import { companyContacts, emailHash } from "@worker/outreach/contacts";
import { checkDueContacts, millionVerifier, type CheckResult } from "@worker/outreach/email-check";
import { findSharedInboxes, runContactFinding } from "@worker/outreach/shared-inboxes";
import { DAILY_NEW_PEOPLE_CAP, listThreads, loadThread, markMessageSent, startThread } from "@worker/outreach/threads";
import type { SearchResult } from "@worker/outreach/sourcing/linkedin-search";
import worker from "@worker/index";
import { createGuestSession } from "@worker/auth";
import type { Env } from "@worker/types";
import { outreachComposeUrl } from "../shared/outreach";
import { sqliteD1 } from "./sqlite-d1";

const migrationsDir = new URL("../migrations/", import.meta.url).pathname;
const databases: Database[] = [];
afterEach(() => {
  for (const db of databases.splice(0)) db.close();
});

const NOW = new Date("2026-10-20T15:00:00Z");
const mx = async (domain: string) => (domain.endsWith(".example") ? ["mx.example"] : []);

function setup(overrides: Partial<Env> = {}) {
  const { sqlite, db } = sqliteD1();
  databases.push(sqlite);
  for (const file of readdirSync(migrationsDir).filter((name) => name.endsWith(".sql")).sort()) {
    sqlite.exec(readFileSync(`${migrationsDir}${file}`, "utf8"));
  }
  sqlite.exec("PRAGMA foreign_keys = ON");
  sqlite.run(`INSERT INTO companies (id, name, ats_type, ats_slug, website, enabled) VALUES
    ('zephyr', 'Zephyr Labs', 'greenhouse', 'zephyr-test', 'https://www.zephyrlabs.example', 1),
    ('zephyr-2', 'Zephyr Labs', 'lever', 'zephyr-test', 'zephyrlabs.example', 1),
    ('other', 'Other Co', 'greenhouse', 'other-test', 'https://otherco.example', 1)`);
  for (const index of [1, 2, 3, 4, 5, 6]) {
    sqlite.run(`INSERT INTO companies (id, name, ats_type, ats_slug, website, enabled) VALUES (?, ?, 'greenhouse', ?, ?, 1)`,
      [`co${index}`, `Company ${index}`, `co${index}-test`, `https://co${index}.example`]);
  }
  sqlite.run(`INSERT INTO jobs (id, company_id, external_id, title, url, location, posted_at, first_seen_at, description)
    VALUES ('z1', 'zephyr', 'z1', 'Software Engineer, New Grad', 'https://example.com/z1', 'New York, NY', ?, ?, '')`, [NOW.toISOString(), NOW.toISOString()]);
  for (const id of ["u1", "u2", "u3", "u4", "u5"]) sqlite.run("INSERT INTO users (id, name) VALUES (?, ?)", [id, id === "u1" ? "Ali Arslan" : ""]);
  const env = { DB: db, ...overrides } as unknown as Env;
  const contact = (id: string, companyId: string, email: string, fields: { title?: string; kind?: string; status?: string; source?: string; name?: string; checkedAt?: string | null } = {}) =>
    sqlite.run(
      `INSERT INTO company_contacts (id, company_id, email, name, title, source, kind, email_status, checked_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, companyId, email, fields.name ?? "", fields.title ?? "University Recruiter", fields.source ?? "import", fields.kind ?? "person",
        fields.status ?? "valid", fields.checkedAt === undefined ? NOW.toISOString() : fields.checkedAt, `2026-10-01T00:00:0${id.length % 10}Z`],
    );
  const status = (id: string) => (sqlite.query("SELECT email_status FROM company_contacts WHERE id = ?").get(id) as { email_status: string } | null)?.email_status;
  return { sqlite, db, env, contact, status };
}

/** A checker that answers from a table and remembers what it was asked. */
function fakeChecker(answers: Record<string, CheckResult | null>, fallback: CheckResult | null = "invalid") {
  const asked: string[] = [];
  return {
    asked,
    check: async (email: string) => {
      asked.push(email);
      return email in answers ? answers[email]! : fallback;
    },
  };
}

describe("the email checker", () => {
  it("reads MillionVerifier's answers", async () => {
    const urls: string[] = [];
    const answer = (result: string, status = 200) => millionVerifier("key/1", (async (url: string) => {
      urls.push(url);
      return new Response(JSON.stringify({ result }), { status });
    }) as unknown as typeof fetch);
    expect(await answer("ok")("a+b@zephyrlabs.example")).toBe("valid");
    expect(urls[0]).toBe("https://api.millionverifier.com/api/v3/?api=key%2F1&email=a%2Bb%40zephyrlabs.example&timeout=10");
    expect(await answer("catch_all")("x@y.example")).toBe("catch_all");
    expect(await answer("unknown")("x@y.example")).toBe("unknown");
    expect(await answer("invalid")("x@y.example")).toBe("invalid");
    expect(await answer("disposable")("x@y.example")).toBe("invalid");
    // The service failing teaches nothing about the address.
    expect(await answer("error")("x@y.example")).toBeNull();
    expect(await answer("ok", 500)("x@y.example")).toBeNull();
  });

  it("checks new addresses first, then any a week old, and never final ones", async () => {
    const { env, contact, status, sqlite } = setup();
    contact("fresh", "zephyr", "fresh@zephyrlabs.example", { checkedAt: NOW.toISOString() });
    contact("stale", "zephyr", "stale@zephyrlabs.example", { checkedAt: "2026-10-12T00:00:00Z" });
    contact("new", "zephyr", "new@zephyrlabs.example", { status: "unchecked", checkedAt: null });
    contact("gone", "zephyr", "gone@zephyrlabs.example", { status: "bounced", checkedAt: "2026-09-01T00:00:00Z" });
    contact("stand-in", "zephyr", "me@example.com", { source: "test", status: "unchecked", checkedAt: null });
    const checker = fakeChecker({ "new@zephyrlabs.example": "valid", "stale@zephyrlabs.example": "invalid" });
    const counts = await checkDueContacts(env, checker.check, { now: NOW });
    expect(checker.asked).toEqual(["new@zephyrlabs.example", "stale@zephyrlabs.example"]);
    expect(counts).toMatchObject({ valid: 1, invalid: 1 });
    expect([status("new"), status("stale"), status("fresh"), status("gone")]).toEqual(["valid", "invalid", "valid", "bounced"]);
    expect((sqlite.query("SELECT checked_at FROM company_contacts WHERE id = 'new'").get() as { checked_at: string }).checked_at).toBe(NOW.toISOString());
  });

  it("keeps a passed address through an unfinished check and asks again tomorrow", async () => {
    const { env, contact, status, sqlite } = setup();
    contact("c1", "zephyr", "c1@zephyrlabs.example", { checkedAt: "2026-10-01T00:00:00Z" });
    await checkDueContacts(env, fakeChecker({}, "unknown").check, { now: NOW });
    expect(status("c1")).toBe("valid");
    const checkedAt = (sqlite.query("SELECT checked_at FROM company_contacts WHERE id = 'c1'").get() as { checked_at: string }).checked_at;
    expect(checkedAt).toBe("2026-10-14T15:00:00.000Z");
    // Not due an hour later; due a day later.
    expect((await checkDueContacts(env, fakeChecker({}, "valid").check, { now: new Date("2026-10-20T16:00:00Z") })).valid).toBe(0);
    expect((await checkDueContacts(env, fakeChecker({}, "valid").check, { now: new Date("2026-10-21T15:00:00Z") })).valid).toBe(1);
  });

  it("tells admins when every check fails", async () => {
    const { env, contact, sqlite } = setup();
    contact("c1", "zephyr", "c1@zephyrlabs.example", { status: "unchecked", checkedAt: null });
    expect((await checkDueContacts(env, fakeChecker({}, null).check, { now: NOW })).failed).toBe(1);
    expect(sqlite.query("SELECT route FROM errors").all()).toEqual([{ route: "contact checks" }]);
  });

  it("stops follow-ups to an address that stopped passing", async () => {
    const { env, contact, sqlite } = setup();
    contact("c1", "zephyr", "c1@zephyrlabs.example", { checkedAt: "2026-10-01T00:00:00Z" });
    const thread = await startThread(env, "u1", { jobId: "z1" }, new Date("2026-10-02T00:00:00Z"));
    await markMessageSent(env, "u1", thread.messages[0]!.id, "America/New_York", new Date("2026-10-02T00:00:00Z"));
    await checkDueContacts(env, fakeChecker({}, "invalid").check, { now: NOW });
    expect((sqlite.query("SELECT status FROM outreach_threads").get() as { status: string }).status).toBe("stopped");
  });
});

describe("who users can write to", () => {
  it("shows only addresses the last check passed", async () => {
    const { env, contact } = setup();
    contact("valid", "zephyr", "valid@zephyrlabs.example");
    for (const state of ["unchecked", "catch_all", "unknown", "invalid", "bounced", "rejected", "removed"]) {
      contact(state, "zephyr", `${state}@zephyrlabs.example`, { status: state });
    }
    contact("admin-test", "zephyr", "test@zephyrlabs.example", { source: "pinkslip-test" });
    expect((await companyContacts(env, "zephyr", "u1", NOW)).available.map((row) => row.id)).toEqual(["valid"]);
  });

  it("shows only the stand-in while a test recipient is set", async () => {
    const { env, contact } = setup({ OUTREACH_TEST_RECIPIENT: "Me@Example.com" });
    contact("valid", "zephyr", "valid@zephyrlabs.example");
    const { available } = await companyContacts(env, "zephyr", "u1", NOW);
    expect(available.map((row) => [row.email, row.source])).toEqual([["me@example.com", "test"]]);
  });

  it("puts a recruiter before a team inbox, and an early-career inbox before other recruiters", async () => {
    const { env, contact } = setup();
    contact("tech", "zephyr", "tech@zephyrlabs.example", { title: "Technical Recruiter" });
    contact("inbox", "zephyr", "university@zephyrlabs.example", { title: "University recruiting", kind: "shared" });
    contact("person", "zephyr", "jane@zephyrlabs.example", { title: "Campus Recruiter", name: "Jane Doe" });
    expect((await companyContacts(env, "zephyr", "u1", NOW)).available.map((row) => row.id)).toEqual(["person", "inbox", "tech"]);
  });

  it("says to try next week when everyone heard from enough users", async () => {
    const { env, contact } = setup();
    contact("c1", "zephyr", "c1@zephyrlabs.example");
    for (const userId of ["u2", "u3", "u4"]) {
      const thread = await startThread(env, userId, { jobId: "z1" }, NOW);
      await markMessageSent(env, userId, thread.messages[0]!.id, "America/New_York", NOW);
    }
    await expect(startThread(env, "u5", { jobId: "z1" }, NOW)).rejects.toMatchObject({ code: "contacts_resting", status: 409 });
    expect((await companyContacts(env, "zephyr", "u5", NOW)).resting).toBe(1);
  });

  it(`starts at most ${DAILY_NEW_PEOPLE_CAP} new people a day`, async () => {
    const { env, contact } = setup();
    for (const index of [1, 2, 3, 4, 5, 6]) contact(`c${index}`, `co${index}`, `university@co${index}.example`, { kind: "shared" });
    for (const index of [1, 2, 3, 4, 5]) await startThread(env, "u1", { companyId: `co${index}` }, NOW);
    await expect(startThread(env, "u1", { companyId: "co6" }, NOW)).rejects.toMatchObject({ code: "daily_cap", status: 429 });
    // A thread already started still opens, and the next day there's room.
    expect((await startThread(env, "u1", { companyId: "co1" }, NOW)).company_id).toBe("co1");
    expect((await startThread(env, "u1", { companyId: "co6" }, new Date("2026-10-21T15:01:00Z"))).company_id).toBe("co6");
  });

  it("writes about the company as a whole from its page, and lists threads by company", async () => {
    const { env, contact } = setup();
    contact("c1", "zephyr", "university@zephyrlabs.example", { kind: "shared", title: "University recruiting" });
    const thread = await startThread(env, "u1", { companyId: "zephyr" }, NOW);
    expect(thread.job_id).toBeNull();
    expect(thread.messages[0]!.subject).toBe("Zephyr Labs — Ali Arslan");
    expect(thread.messages[0]!.body).toContain("I'd love to work at Zephyr Labs");
    expect(thread.messages[0]!.body).toStartWith("Hi there,");
    expect(thread.messages[1]!.body).toContain("my note about roles at Zephyr Labs");
    // Starting from a job there finds the same thread: one per recruiter.
    expect((await startThread(env, "u1", { jobId: "z1" }, NOW)).id).toBe(thread.id);
    expect((await listThreads(env.DB, "u1", { companyId: "zephyr" })).map((item) => item.id)).toEqual([thread.id]);
    expect(await listThreads(env.DB, "u1", { companyId: "other" })).toEqual([]);
  });
});

describe("the shared-inbox search", () => {

  it("tries addresses a page shows before the usual names, and stops at two", async () => {
    const search = async (): Promise<SearchResult[]> => [{
      title: "Zephyr Labs Students",
      link: "https://zephyrlabs.example/students",
      snippet: "Questions? Write to earlycareers-team@zephyrlabs.example or press@zephyrlabs.example.",
    }];
    const checker = fakeChecker({ "earlycareers-team@zephyrlabs.example": "valid", "campus@zephyrlabs.example": "valid" });
    const result = await findSharedInboxes("https://www.zephyrlabs.example", { check: checker.check, search, mx });
    expect(checker.asked).toEqual([
      "earlycareers-team@zephyrlabs.example", "university@zephyrlabs.example",
      "universityrecruiting@zephyrlabs.example", "campus@zephyrlabs.example",
    ]);
    expect(result.outcome).toBe("found");
    expect(result.inboxes).toEqual([
      { email: "earlycareers-team@zephyrlabs.example", title: "Early careers", evidenceUrl: "https://zephyrlabs.example/students", status: "valid" },
      { email: "campus@zephyrlabs.example", title: "Campus recruiting", evidenceUrl: null, status: "valid" },
    ]);
  });

  it("stops guessing at a domain that takes any address", async () => {
    const checker = fakeChecker({}, "catch_all");
    const result = await findSharedInboxes("otherco.example", { check: checker.check, search: null, mx });
    expect(checker.asked).toHaveLength(1);
    expect(result).toMatchObject({ outcome: "catch_all", inboxes: [] });
  });

  it("skips a company whose domain takes no mail", async () => {
    const checker = fakeChecker({});
    expect((await findSharedInboxes("https://nomail.test", { check: checker.check, search: null, mx })).outcome).toBe("no_mail");
    expect(checker.asked).toEqual([]);
  });

  it("saves what passed, never a suppressed address, and records every company", async () => {
    const { env, sqlite } = setup();
    sqlite.run("INSERT INTO contact_suppressions (email_hash, reason, created_at) VALUES (?, 'rejected', ?)", [await emailHash("university@zephyrlabs.example"), NOW.toISOString()]);
    sqlite.run("UPDATE companies SET enabled = 0 WHERE id NOT IN ('zephyr', 'other')");
    sqlite.run("UPDATE companies SET website = 'https://otherco.test' WHERE id = 'other'");
    const checker = fakeChecker({ "university@zephyrlabs.example": "valid", "campus@zephyrlabs.example": "valid" });
    // Hiring companies go first: Zephyr has a job open.
    const runs = await runContactFinding(env, checker.check, { count: 5, now: NOW, search: null, mx });
    expect(runs).toEqual([
      { company: "Zephyr Labs", outcome: "found", found: ["campus@zephyrlabs.example"], error: null },
      { company: "Other Co", outcome: "no_mail", found: [], error: null },
    ]);
    expect(sqlite.query("SELECT company_id, email, title, kind, source, email_status FROM company_contacts").all()).toEqual([
      { company_id: "zephyr", email: "campus@zephyrlabs.example", title: "Campus recruiting", kind: "shared", source: "guess", email_status: "valid" },
    ]);
    expect(sqlite.query("SELECT company_id, outcome, found FROM contact_finding ORDER BY company_id").all()).toEqual([
      { company_id: "other", outcome: "no_mail", found: 0 },
      { company_id: "zephyr", outcome: "found", found: 1 },
    ]);
    // Searched companies wait a quarter; a failed one is tried the next day.
    expect(await runContactFinding(env, checker.check, { count: 5, now: NOW, search: null, mx })).toEqual([]);
    sqlite.run("UPDATE contact_finding SET outcome = 'error' WHERE company_id = 'other'");
    expect((await runContactFinding(env, checker.check, { count: 5, now: new Date("2026-10-21T16:00:00Z"), search: null, mx })).map((run) => run.company)).toEqual(["Other Co"]);
  });
});

describe("removal and rejection", () => {
  it("removes a recruiter who asked, everywhere and for good", async () => {
    const { env, contact, sqlite, status } = setup();
    contact("c1", "zephyr", "jane@zephyrlabs.example", { name: "Jane Doe", title: "Campus Recruiter" });
    contact("c2", "zephyr-2", "jane@zephyrlabs.example", { name: "Jane Doe" });
    const thread = await startThread(env, "u1", { jobId: "z1" }, NOW);
    await markMessageSent(env, "u1", thread.messages[0]!.id, "America/New_York", NOW);
    sqlite.run(`INSERT INTO recruiter_candidates (id, company_id, profile_url, name, kind, employer_evidence, email_guess, found_at, seen_at)
      VALUES ('rc1', 'zephyr', 'https://linkedin.example/in/jane', 'Jane Doe', 'early_career', 'current employer', 'jane@zephyrlabs.example', ?, ?)`, [NOW.toISOString(), NOW.toISOString()]);

    expect(await removeContactEmail(env.DB, " Jane@ZephyrLabs.example ", NOW)).toEqual({ contacts: 2, threads_stopped: 1 });
    expect([status("c1"), status("c2")]).toEqual(["removed", "removed"]);
    expect(sqlite.query("SELECT email, name, title FROM company_contacts WHERE id = 'c1'").get()).toEqual({ email: "removed:c1", name: "", title: "" });
    expect(sqlite.query("SELECT email_guess FROM recruiter_candidates").get()).toEqual({ email_guess: null });
    const after = await loadThread(env.DB, "u1", thread.id);
    expect(after?.status).toBe("stopped");
    expect(after?.contact).toEqual({ name: "", email: "", title: "", test: false });
    // An import can't bring them back.
    const report = await importContacts(env.DB, [{ company: "zephyr", email: "jane@zephyrlabs.example" }], { now: NOW });
    expect(report.skipped).toEqual([{ row: 1, email: "jane@zephyrlabs.example", reason: "suppressed" }]);
  });

  it("deletes a turned-down contact nobody wrote to, and hides one somebody did", async () => {
    const { env, contact, sqlite, status } = setup();
    contact("unused", "other", "university@otherco.example", { kind: "shared" });
    contact("used", "zephyr", "university@zephyrlabs.example", { kind: "shared" });
    await startThread(env, "u1", { jobId: "z1" }, NOW);
    expect(await rejectContact(env.DB, "unused", NOW)).toBe(true);
    expect(await rejectContact(env.DB, "used", NOW)).toBe(true);
    expect(await rejectContact(env.DB, "nope", NOW)).toBe(false);
    expect(status("unused")).toBeUndefined();
    expect(status("used")).toBe("rejected");
    expect(sqlite.query("SELECT reason FROM contact_suppressions").all()).toEqual([{ reason: "rejected" }, { reason: "rejected" }]);
  });
});

describe("importing a list", () => {
  it("reads a CSV with quotes and a header in any order", () => {
    expect(parseContactCsv(`email,Website,name,title\r\njane@x.example,x.example,"Doe, Jane","Recruiter, ""Campus"""\n\nbad,,,\n`)).toEqual([
      { company: "x.example", email: "jane@x.example", name: "Doe, Jane", title: "Recruiter, \"Campus\"", kind: "", source: "" },
      { company: "", email: "bad", name: "", title: "", kind: "", source: "" },
    ]);
  });

  it("matches companies by id, website or the address's domain, and starts everything unchecked", async () => {
    const { env, sqlite, contact } = setup();
    contact("known", "other", "campus@otherco.example", { kind: "shared", title: "" });
    const rows = [
      { company: "https://zephyrlabs.example/careers", email: "Jane@ZephyrLabs.example", name: "Jane Doe", title: "Campus Recruiter" },
      { company: "", email: "university@co1.example" },
      { company: "co2", email: "students@elsewhere.example", kind: "shared" },
      { company: "", email: "campus@otherco.example", title: "Campus recruiting" },
      { company: "nowhere.example", email: "a@nowhere.example" },
      { company: "co3", email: "not an email" },
    ];
    expect(await importContacts(env.DB, rows, { dryRun: true, now: NOW })).toMatchObject({ added: 4, updated: 1 });
    expect(sqlite.query("SELECT COUNT(*) AS n FROM company_contacts").get()).toEqual({ n: 1 });

    const report = await importContacts(env.DB, rows, { now: NOW });
    expect(report).toEqual({
      added: 4,
      updated: 1,
      skipped: [{ row: 5, email: "a@nowhere.example", reason: "no company" }, { row: 6, email: "not an email", reason: "bad email" }],
    });
    // Zephyr is listed twice (two job sources, one website): both get Jane.
    expect(sqlite.query("SELECT company_id, kind, email_status, source FROM company_contacts WHERE email = 'jane@zephyrlabs.example' ORDER BY company_id").all()).toEqual([
      { company_id: "zephyr", kind: "person", email_status: "unchecked", source: "import" },
      { company_id: "zephyr-2", kind: "person", email_status: "unchecked", source: "import" },
    ]);
    expect(sqlite.query("SELECT kind FROM company_contacts WHERE email = 'university@co1.example'").get()).toEqual({ kind: "shared" });
    // An update keeps the check it had and fills in what was blank.
    expect(sqlite.query("SELECT title, email_status FROM company_contacts WHERE id = 'known'").get()).toEqual({ title: "Campus recruiting", email_status: "valid" });
  });
});

describe("bounces and auto-replies", () => {
  function mime(headers: Record<string, string>, body: string): string {
    return `${Object.entries(headers).map(([key, value]) => `${key}: ${value}`).join("\r\n")}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${body}`;
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

  it("knows a bounce and an auto-reply when it sees one", () => {
    const daemon = { name: "Mail Delivery Subsystem", address: "mailer-daemon@googlemail.com" };
    const person = { name: "Jane", address: "jane@zephyrlabs.example" };
    expect(isBounce(daemon, "Delivery Status Notification (Failure)")).toBe(true);
    expect(isBounce(daemon, "Delivery Status Notification (Delay)")).toBe(false);
    expect(isBounce({ name: "", address: "postmaster@outlook.com" }, "Undeliverable: Software Engineer — Ali")).toBe(true);
    expect(isBounce({ name: "Me", address: "me@gmail.com" }, "Fwd: Undeliverable: Software Engineer — Ali")).toBe(true);
    expect(isBounce(person, "Re: Software Engineer — Ali")).toBe(false);
    expect(isAutoReply(new Headers({ "auto-submitted": "auto-replied" }), "Re: hi")).toBe(true);
    expect(isAutoReply(new Headers(), "Automatic reply: Software Engineer — Ali")).toBe(true);
    expect(isAutoReply(new Headers({ "auto-submitted": "auto-generated" }), "Thanks for applying")).toBe(false);
    expect(saysTheyLeft("Thanks for your email. I am no longer with Zephyr Labs.")).toBe(true);
    expect(saysTheyLeft("I'm out of the office until Monday.")).toBe(false);
  });

  async function wroteTo(env: Env, contact: ReturnType<typeof setup>["contact"]) {
    contact("c1", "zephyr", "jane@zephyrlabs.example", { name: "Jane Doe" });
    contact("c2", "other", "university@otherco.example", { kind: "shared" });
    const thread = await startThread(env, "u1", { jobId: "z1" }, NOW);
    await markMessageSent(env, "u1", thread.messages[0]!.id, "America/New_York", NOW);
    return { thread, inbox: await getOrCreateInbox(env.DB, "u1") };
  }

  it("marks an address the user wrote to bounced, and nothing else", async () => {
    const { env, contact, status, sqlite } = setup();
    const { inbox } = await wroteTo(env, contact);
    await handleInboundEmail(message(inbox.address, mime({
      From: "Mail Delivery Subsystem <mailer-daemon@googlemail.com>",
      To: "me@gmail.com",
      Subject: "Delivery Status Notification (Failure)",
    }, "Address not found. Your message wasn't delivered to jane@zephyrlabs.example because the address couldn't be found. Also mentions university@otherco.example.")), env);
    expect([status("c1"), status("c2")]).toEqual(["bounced", "valid"]);
    expect((sqlite.query("SELECT status FROM outreach_threads").get() as { status: string }).status).toBe("stopped");
  });

  it("doesn't count an out-of-office as a reply, and drops someone who left", async () => {
    const { env, contact, status } = setup();
    const { thread, inbox } = await wroteTo(env, contact);
    const autoReply = (body: string) => message(inbox.address, mime({
      From: "Jane Doe <jane@zephyrlabs.example>",
      To: "me@gmail.com",
      Subject: "Automatic reply: Software Engineer, New Grad - Ali Arslan",
      "Auto-Submitted": "auto-replied",
    }, body));
    await handleInboundEmail(autoReply("I'm out of the office until Monday."), env);
    expect((await loadThread(env.DB, "u1", thread.id))?.status).toBe("active");
    expect(status("c1")).toBe("valid");
    await handleInboundEmail(autoReply("I am no longer with Zephyr Labs. Please write to university@zephyrlabs.example."), env);
    expect((await loadThread(env.DB, "u1", thread.id))?.status).toBe("stopped");
    expect(status("c1")).toBe("bounced");
  });
});

describe("web mail", () => {
  it("opens the message in Gmail's or Outlook's compose window", () => {
    const message = { subject: "Software Engineer — Ali", body: "Hi Jane,\n\nThanks & regards" };
    expect(outreachComposeUrl("gmail", "jane@zephyrlabs.example", message)).toBe(
      "https://mail.google.com/mail/?view=cm&fs=1&to=jane%40zephyrlabs.example&su=Software%20Engineer%20%E2%80%94%20Ali&body=Hi%20Jane%2C%0A%0AThanks%20%26%20regards");
    expect(outreachComposeUrl("outlook", "jane@zephyrlabs.example", message)).toBe(
      "https://outlook.live.com/mail/0/deeplink/compose?to=jane%40zephyrlabs.example&subject=Software%20Engineer%20%E2%80%94%20Ali&body=Hi%20Jane%2C%0A%0AThanks%20%26%20regards");
  });
});

describe("admin routes", () => {
  it("are for admins, and take a CSV", async () => {
    const mail: Array<{ text?: string }> = [];
    const { env, sqlite } = setup({
      EMAIL: { send: async (sent: { text?: string }) => { mail.push(sent); } },
      EMAIL_FROM_ADDRESS: "login@pinkslip.work",
    } as unknown as Partial<Env>);
    const ctx = { waitUntil() {}, passThroughOnException() {} } as unknown as ExecutionContext;
    const request = (token: string) => (path: string, init: { method?: string; body?: string; type?: string } = {}) =>
      worker.fetch(new Request(`https://pinkslip.work/api/v2${path}`, {
        method: init.method ?? "GET",
        headers: { authorization: `Bearer ${token}`, "x-pinkslip-client": "ios", "content-type": init.type ?? "application/json" },
        body: init.body,
      }), env, ctx);
    const guest = await createGuestSession(env.DB);
    const start = request(guest.id);
    await start("/auth/email/code/start", { method: "POST", body: JSON.stringify({ email: "owner@example.com" }) });
    const code = mail.at(-1)?.text?.match(/code is (\d{6})/)?.[1] ?? "";
    const { native_token: token } = await (await start("/auth/email/code/verify", { method: "POST", body: JSON.stringify({ email: "owner@example.com", code }) })).json() as { native_token: string };
    const call = request(token);
    expect((await call("/contacts")).status).toBeGreaterThanOrEqual(401);

    sqlite.run("UPDATE users SET role = 'admin' WHERE id = (SELECT user_id FROM auth_identities WHERE provider_subject = 'owner@example.com')");
    const imported = await call("/contacts/import", { method: "POST", type: "text/csv", body: "company,email\nco1.example,university@co1.example\n" });
    expect(imported.status).toBe(200);
    expect(await imported.json()).toMatchObject({ dry_run: false, added: 1 });
    const listed = await (await call("/contacts")).json() as { checker: boolean; contacts: Array<{ email: string }> };
    expect(listed.checker).toBe(false);
    expect(listed.contacts.map((row) => row.email)).toEqual(["university@co1.example"]);
    expect((await call("/contacts/check", { method: "POST" })).status).toBe(503);
  });
});
