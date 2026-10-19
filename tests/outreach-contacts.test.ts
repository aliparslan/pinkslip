import { Database } from "bun:sqlite";
import { afterEach, describe, expect, it } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { createGuestSession } from "@worker/auth";
import { isAutoReply, isBounce, saysTheyLeft } from "@worker/email/bounces";
import { handleInboundEmail } from "@worker/email/handler";
import { getOrCreateInbox } from "@worker/inbox";
import worker from "@worker/index";
import { importContacts, parseContactCsv, removeContactEmail, unlistContact } from "@worker/outreach/contact-admin";
import { companyContacts, emailHash, listCompanyPeople, syncCandidateContact, syncCompanyCandidates } from "@worker/outreach/contacts";
import { DAILY_NEW_PEOPLE_CAP, listThreads, loadThread, markMessageSent, startThread } from "@worker/outreach/threads";
import type { Env } from "@worker/types";
import { outreachComposeUrl } from "../shared/outreach";
import { sqliteD1 } from "./sqlite-d1";

const migrationsDir = new URL("../migrations/", import.meta.url).pathname;
const migrationFiles = readdirSync(migrationsDir).filter((name) => name.endsWith(".sql")).sort();
const databases: Database[] = [];
afterEach(() => {
  for (const db of databases.splice(0)) db.close();
});

const NOW = new Date("2026-10-20T15:00:00Z");

function setup(overrides: Partial<Env> = {}) {
  const { sqlite, db } = sqliteD1();
  databases.push(sqlite);
  for (const file of migrationFiles) sqlite.exec(readFileSync(`${migrationsDir}${file}`, "utf8"));
  sqlite.exec("PRAGMA foreign_keys = ON");
  sqlite.run(`INSERT INTO companies (id, name, ats_type, ats_slug, website, enabled) VALUES
    ('zephyr', 'Zephyr Labs', 'greenhouse', 'zephyr-test', 'https://www.zephyrlabs.example', 1),
    ('zephyr-2', 'Zephyr Labs', 'lever', 'zephyr-test', 'zephyrlabs.example', 1),
    ('other', 'Other Co', 'greenhouse', 'other-test', 'https://otherco.example', 1)`);
  for (const index of [1, 2, 3, 4, 5, 6]) {
    sqlite.run(`INSERT INTO companies (id, name, ats_type, ats_slug, website, enabled) VALUES (?, ?, 'greenhouse', ?, ?, 1)`,
      [`co${index}`, `Company ${index}`, `co${index}-test`, `https://co${index}.example`]);
  }
  sqlite.run(`INSERT INTO jobs (id, company_id, external_id, title, url, location, posted_at, first_seen_at, description) VALUES
    ('z1', 'zephyr', 'z1', 'Software Engineer, New Grad', 'https://example.com/z1', 'New York, NY', ?, ?, ''),
    ('o1', 'other', 'o1', 'Data Analyst', 'https://example.com/o1', 'Remote', ?, ?, '')`,
    [NOW.toISOString(), NOW.toISOString(), NOW.toISOString(), NOW.toISOString()]);
  for (const id of ["u1", "u2", "u3", "u4", "u5"]) sqlite.run("INSERT INTO users (id, name) VALUES (?, ?)", [id, id === "u1" ? "Ali Arslan" : ""]);
  const env = { DB: db, ...overrides } as unknown as Env;
  const contact = (id: string, companyId: string, email: string, fields: { title?: string; status?: string; source?: string; name?: string } = {}) =>
    sqlite.run(
      `INSERT INTO company_contacts (id, company_id, email, name, title, source, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, companyId, email, fields.name ?? "Dana Whitfield", fields.title ?? "University Recruiter", fields.source ?? "import",
        fields.status ?? "listed", NOW.toISOString()],
    );
  const candidate = (id: string, fields: { company?: string; email?: string | null; works?: string | null; role?: string | null; name?: string } = {}) =>
    sqlite.run(
      `INSERT INTO recruiter_candidates (id, company_id, profile_url, name, headline, current_title, kind, employer_evidence, email_guess, works_there, actual_role, found_at, seen_at)
       VALUES (?, ?, ?, ?, 'Campus Recruiter at Zephyr Labs | ex-Acme', 'Campus Recruiter', 'early_career', 'current employer', ?, ?, ?, ?, ?)`,
      [id, fields.company ?? "zephyr", `https://www.linkedin.com/in/${id}`, fields.name ?? "Dana Whitfield",
        fields.email === undefined ? "dana.whitfield@zephyrlabs.example" : fields.email, fields.works ?? null, fields.role ?? null,
        NOW.toISOString(), NOW.toISOString()],
    );
  const status = (id: string) => (sqlite.query("SELECT status FROM company_contacts WHERE id = ?").get(id) as { status: string } | null)?.status;
  const sent = async (userId: string, target: Parameters<typeof startThread>[2], at = NOW) => {
    const thread = await startThread(env, userId, target, at);
    return markMessageSent(env, userId, thread.messages[0]!.id, "America/New_York", at);
  };
  return { sqlite, db, env, contact, candidate, status, sent };
}

describe("confirmed recruiters", () => {
  it("lists a recruiter labelled \"works there: yes\", and steps them aside when the label changes", async () => {
    const { db, sqlite, candidate } = setup();
    candidate("dana", { works: "yes" });
    await syncCandidateContact(db, "dana", NOW);
    expect(sqlite.query("SELECT company_id, email, name, title, source, status, profile_url FROM company_contacts").all()).toEqual([{
      company_id: "zephyr", email: "dana.whitfield@zephyrlabs.example", name: "Dana Whitfield", title: "Campus Recruiter",
      source: "sourcing", status: "listed", profile_url: "https://www.linkedin.com/in/dana",
    }]);
    for (const [works, role, expected] of [["no", null, "hidden"], ["yes", "other_recruiter", "listed"], ["yes", "not_recruiter", "hidden"], ["unsure", null, "hidden"], ["yes", "early_career", "listed"]] as const) {
      sqlite.run("UPDATE recruiter_candidates SET works_there = ?, actual_role = ? WHERE id = 'dana'", [works, role]);
      await syncCandidateContact(db, "dana", NOW);
      expect((sqlite.query("SELECT status FROM company_contacts").get() as { status: string }).status).toBe(expected);
    }
    // Nobody without a guessed address, or without a label.
    candidate("nameless", { works: "yes", email: null });
    candidate("unlabelled", { email: "sam@zephyrlabs.example" });
    await syncCompanyCandidates(db, "zephyr", NOW);
    expect(sqlite.query("SELECT COUNT(*) AS n FROM company_contacts").get()).toEqual({ n: 1 });
  });

  it("follows a changed guess, keeping the old address for threads that used it", async () => {
    const { env, db, sqlite, candidate, sent } = setup();
    candidate("dana", { works: "yes" });
    await syncCandidateContact(db, "dana", NOW);
    const thread = await sent("u1", { jobId: "z1" });
    sqlite.run("UPDATE recruiter_candidates SET email_guess = 'dwhitfield@zephyrlabs.example' WHERE id = 'dana'");
    await syncCompanyCandidates(db, "zephyr", NOW);
    expect(sqlite.query("SELECT email, status FROM company_contacts ORDER BY email").all()).toEqual([
      { email: "dana.whitfield@zephyrlabs.example", status: "hidden" },
      { email: "dwhitfield@zephyrlabs.example", status: "listed" },
    ]);
    expect((await loadThread(env.DB, "u1", thread.id))?.contact.email).toBe("dana.whitfield@zephyrlabs.example");
  });

  it("never lists a bounced address again, or one that asked to be left alone", async () => {
    const { db, sqlite, candidate, contact } = setup();
    contact("old", "zephyr", "dana.whitfield@zephyrlabs.example", { status: "bounced" });
    candidate("dana", { works: "yes" });
    candidate("sam", { works: "yes", email: "sam@zephyrlabs.example", name: "Sam Lee" });
    sqlite.run("INSERT INTO contact_suppressions (email_hash, created_at) VALUES (?, ?)", [await emailHash("SAM@zephyrlabs.example"), NOW.toISOString()]);
    await syncCompanyCandidates(db, "zephyr", NOW);
    expect(sqlite.query("SELECT email, status FROM company_contacts").all()).toEqual([{ email: "dana.whitfield@zephyrlabs.example", status: "bounced" }]);
  });

  it("lists the recruiters already confirmed when the migration runs", () => {
    const { sqlite, candidate } = setup();
    candidate("dana", { works: "yes", role: "other_recruiter" });
    candidate("sam", { works: "yes", role: "not_recruiter", email: "sam@zephyrlabs.example" });
    candidate("kim", { works: "no", email: "kim@zephyrlabs.example" });
    const migration = readFileSync(`${migrationsDir}0100_outreach_contacts.sql`, "utf8");
    sqlite.exec(migration.slice(migration.indexOf("INSERT INTO company_contacts")));
    expect(sqlite.query("SELECT email, source, status, candidate_id FROM company_contacts").all()).toEqual([
      { email: "dana.whitfield@zephyrlabs.example", source: "sourcing", status: "listed", candidate_id: "dana" },
    ]);
  });
});

describe("who users can write to", () => {
  it("is the listed recruiters only", async () => {
    const { env, contact } = setup();
    contact("listed", "zephyr", "listed@zephyrlabs.example");
    for (const state of ["hidden", "bounced", "removed"]) contact(state, "zephyr", `${state}@zephyrlabs.example`, { status: state });
    contact("admin-test", "zephyr", "test@zephyrlabs.example", { source: "pinkslip-test" });
    expect((await companyContacts(env, "zephyr", "u1", NOW)).available.map((row) => row.id)).toEqual(["listed"]);
  });

  it("addresses every email to the stand-in while a test recipient is set", async () => {
    const { env, contact } = setup({ OUTREACH_TEST_RECIPIENT: "Me@Example.com" });
    contact("dana", "zephyr", "dana@zephyrlabs.example");
    const thread = await startThread(env, "u1", { contactId: "dana" }, NOW);
    expect(thread.contact).toMatchObject({ name: "Dana Whitfield", email: "me@example.com", test: true });
    // A company with nobody listed gets the stand-in itself, as before.
    const other = await startThread(env, "u1", { jobId: "o1" }, NOW);
    expect(other.contact).toMatchObject({ name: "", email: "me@example.com", title: "Recruiter (test)", test: true });
  });

  it("puts early-career recruiters first", async () => {
    const { env, contact } = setup();
    contact("tech", "zephyr", "tech@zephyrlabs.example", { title: "Technical Recruiter" });
    contact("campus", "zephyr", "jane@zephyrlabs.example", { title: "Campus Recruiter" });
    expect((await companyContacts(env, "zephyr", "u1", NOW)).available.map((row) => row.id)).toEqual(["campus", "tech"]);
  });

  it("says to try next week when a recruiter heard from enough users", async () => {
    const { env, contact, sent } = setup();
    contact("c1", "zephyr", "c1@zephyrlabs.example");
    for (const userId of ["u2", "u3", "u4"]) await sent(userId, { contactId: "c1" });
    await expect(startThread(env, "u5", { contactId: "c1" }, NOW)).rejects.toMatchObject({ code: "contacts_resting", status: 409 });
    await expect(startThread(env, "u5", { jobId: "z1" }, NOW)).rejects.toMatchObject({ code: "contacts_resting" });
    expect((await companyContacts(env, "zephyr", "u5", NOW)).resting).toBe(1);
  });

  it(`emails at most ${DAILY_NEW_PEOPLE_CAP} new people a day; drafts don't count`, async () => {
    const { env, contact, sent } = setup();
    for (const index of [1, 2, 3, 4, 5, 6]) contact(`c${index}`, `co${index}`, `recruiter@co${index}.example`);
    // Looking at someone opens a draft; that alone uses nothing up.
    await startThread(env, "u1", { contactId: "c6" }, NOW);
    for (const index of [1, 2, 3, 4, 5]) await sent("u1", { contactId: `c${index}` });
    contact("c7", "zephyr", "c7@zephyrlabs.example");
    await expect(startThread(env, "u1", { contactId: "c7" }, NOW)).rejects.toMatchObject({ code: "daily_cap", status: 429 });
    // A thread already started still opens, and the next day there's room.
    expect((await startThread(env, "u1", { contactId: "c6" }, NOW)).company_id).toBe("co6");
    expect((await startThread(env, "u1", { contactId: "c7" }, new Date("2026-10-21T15:01:00Z"))).company_id).toBe("zephyr");
  });

  it("writes to a chosen person about their company's job, or about the company", async () => {
    const { env, contact } = setup();
    contact("dana", "zephyr", "dana@zephyrlabs.example");
    contact("ravi", "zephyr", "ravi@zephyrlabs.example", { name: "Ravi Patel", title: "Technical Recruiter" });
    const aboutJob = await startThread(env, "u1", { contactId: "ravi", jobId: "z1" }, NOW);
    expect(aboutJob.contact.name).toBe("Ravi Patel");
    expect(aboutJob.messages[0]!.subject).toBe("Software Engineer, New Grad — Ali Arslan");
    const aboutCompany = await startThread(env, "u1", { contactId: "dana", jobId: "o1" }, NOW);
    expect(aboutCompany.job_id).toBeNull();
    expect(aboutCompany.messages[0]!.subject).toBe("Zephyr Labs — Ali Arslan");
    expect(aboutCompany.messages[0]!.body).toContain("I'd love to work at Zephyr Labs");
    expect(aboutCompany.messages[1]!.body).toContain("my note about roles at Zephyr Labs");
    // Once per person.
    expect((await startThread(env, "u1", { contactId: "dana" }, NOW)).id).toBe(aboutCompany.id);
    expect((await listThreads(env.DB, "u1", { companyId: "zephyr" })).map((thread) => thread.id).sort()).toEqual([aboutJob.id, aboutCompany.id].sort());
    await expect(startThread(env, "u1", { contactId: "nobody" }, NOW)).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("People", () => {
  it("lists the company's recruiters and anyone you wrote to there, across its job sources", async () => {
    const { env, contact, sent, sqlite } = setup({ OUTREACH_TEST_RECIPIENT: "me@example.com" });
    contact("dana", "zephyr", "dana@zephyrlabs.example");
    contact("ravi", "zephyr-2", "ravi@zephyrlabs.example", { name: "Ravi Patel", title: "Technical Recruiter" });
    contact("gone", "zephyr", "gone@zephyrlabs.example", { name: "Kim Ode", title: "Recruiter" });
    contact("removed", "zephyr", "removed:x", { name: "", status: "removed" });
    contact("elsewhere", "other", "pat@otherco.example", { name: "Pat Jones" });
    const thread = await sent("u1", { contactId: "gone" });
    sqlite.run("UPDATE company_contacts SET status = 'bounced' WHERE id = 'gone'");
    const people = await listCompanyPeople(env.DB, "zephyr-2", "u1");
    expect(people.map((person) => [person.name, person.title, person.thread?.first_sent_at ?? null])).toEqual([
      ["Dana Whitfield", "University Recruiter", null],
      ["Ravi Patel", "Technical Recruiter", null],
      ["Kim Ode", "Recruiter", NOW.toISOString()],
    ]);
    expect(people[2]!.thread).toEqual({ id: thread.id, status: "active", first_sent_at: NOW.toISOString() });
    // Someone else's thread doesn't show; the stand-in only with your own thread.
    expect((await listCompanyPeople(env.DB, "zephyr", "u2")).map((person) => person.name)).toEqual(["Dana Whitfield", "Ravi Patel"]);
    sqlite.run("DELETE FROM company_contacts WHERE id = 'elsewhere'");
    expect(await listCompanyPeople(env.DB, "other", "u2")).toEqual([]);
    await startThread(env, "u2", { jobId: "o1" }, NOW);
    expect((await listCompanyPeople(env.DB, "other", "u2")).map((person) => person.title)).toEqual(["Recruiter (test)"]);
  });
});

describe("removal and taking someone off", () => {
  it("removes a recruiter who asked, everywhere and for good", async () => {
    const { env, db, contact, candidate, sqlite, status, sent } = setup();
    candidate("dana", { works: "yes" });
    await syncCandidateContact(db, "dana", NOW);
    contact("c2", "zephyr-2", "dana.whitfield@zephyrlabs.example");
    const id = (sqlite.query("SELECT id FROM company_contacts WHERE company_id = 'zephyr'").get() as { id: string }).id;
    const thread = await sent("u1", { contactId: id });

    expect(await removeContactEmail(env.DB, " Dana.Whitfield@ZephyrLabs.example ", NOW)).toEqual({ contacts: 2, threads_stopped: 1 });
    expect([status(id), status("c2")]).toEqual(["removed", "removed"]);
    expect(sqlite.query("SELECT email, name, title, profile_url FROM company_contacts WHERE id = 'c2'").get()).toEqual({ email: "removed:c2", name: "", title: "", profile_url: null });
    expect(sqlite.query("SELECT COUNT(*) AS n FROM recruiter_candidates").get()).toEqual({ n: 0 });
    const after = await loadThread(env.DB, "u1", thread.id);
    expect(after?.status).toBe("stopped");
    expect(after?.contact).toEqual({ name: "", email: "", title: "", test: false });
    // Found and confirmed again later, or imported: still not listed.
    candidate("dana-again", { works: "yes" });
    await syncCandidateContact(db, "dana-again", NOW);
    expect(sqlite.query("SELECT COUNT(*) AS n FROM company_contacts WHERE status = 'listed'").get()).toEqual({ n: 0 });
    const report = await importContacts(env.DB, [{ company: "other", email: "dana.whitfield@zephyrlabs.example" }], { now: NOW });
    expect(report.skipped).toEqual([{ row: 1, email: "dana.whitfield@zephyrlabs.example", reason: "suppressed" }]);
  });

  it("deletes an unlisted contact nobody wrote to, and hides one somebody did", async () => {
    const { env, contact, status } = setup();
    contact("unused", "other", "pat@otherco.example");
    contact("used", "zephyr", "dana@zephyrlabs.example");
    await startThread(env, "u1", { contactId: "used" }, NOW);
    expect(await unlistContact(env.DB, "unused")).toBe(true);
    expect(await unlistContact(env.DB, "used")).toBe(true);
    expect(await unlistContact(env.DB, "nope")).toBe(false);
    expect(status("unused")).toBeUndefined();
    expect(status("used")).toBe("hidden");
  });
});

describe("importing a list", () => {
  it("reads a CSV with quotes and a header in any order", () => {
    expect(parseContactCsv(`email,Website,name,title\r\njane@x.example,x.example,"Doe, Jane","Recruiter, ""Campus"""\n\nbad,,,\n`)).toEqual([
      { company: "x.example", email: "jane@x.example", name: "Doe, Jane", title: "Recruiter, \"Campus\"", source: "" },
      { company: "", email: "bad", name: "", title: "", source: "" },
    ]);
  });

  it("matches companies by id, website or the address's domain, and lists them at once", async () => {
    const { env, sqlite, contact } = setup();
    contact("known", "other", "pat@otherco.example", { title: "", status: "hidden" });
    const rows = [
      { company: "https://zephyrlabs.example/careers", email: "Jane@ZephyrLabs.example", name: "Jane Doe", title: "Campus Recruiter" },
      { company: "", email: "lee@co1.example" },
      { company: "co2", email: "kim@elsewhere.example" },
      { company: "", email: "pat@otherco.example", title: "Campus Recruiter" },
      { company: "nowhere.example", email: "a@nowhere.example" },
      { company: "co3", email: "not an email" },
    ];
    expect(await importContacts(env.DB, rows, { dryRun: true, now: NOW })).toMatchObject({ added: 4, updated: 1 });
    expect(sqlite.query("SELECT COUNT(*) AS n FROM company_contacts").get()).toEqual({ n: 1 });

    expect(await importContacts(env.DB, rows, { now: NOW })).toEqual({
      added: 4,
      updated: 1,
      skipped: [{ row: 5, email: "a@nowhere.example", reason: "no company" }, { row: 6, email: "not an email", reason: "bad email" }],
    });
    // Zephyr is listed twice (two job sources, one website): both get Jane.
    expect(sqlite.query("SELECT company_id, status, source FROM company_contacts WHERE email = 'jane@zephyrlabs.example' ORDER BY company_id").all()).toEqual([
      { company_id: "zephyr", status: "listed", source: "import" },
      { company_id: "zephyr-2", status: "listed", source: "import" },
    ]);
    expect(sqlite.query("SELECT title, status FROM company_contacts WHERE id = 'known'").get()).toEqual({ title: "Campus Recruiter", status: "listed" });
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
    expect(isBounce(daemon, "Delivery Status Notification (Failure)")).toBe(true);
    expect(isBounce(daemon, "Delivery Status Notification (Delay)")).toBe(false);
    expect(isBounce({ name: "", address: "postmaster@outlook.com" }, "Undeliverable: Software Engineer — Ali")).toBe(true);
    expect(isBounce({ name: "Me", address: "me@gmail.com" }, "Fwd: Undeliverable: Software Engineer — Ali")).toBe(true);
    expect(isBounce({ name: "Jane", address: "jane@zephyrlabs.example" }, "Re: Software Engineer — Ali")).toBe(false);
    expect(isAutoReply(new Headers({ "auto-submitted": "auto-replied" }), "Re: hi")).toBe(true);
    expect(isAutoReply(new Headers(), "Automatic reply: Software Engineer — Ali")).toBe(true);
    expect(isAutoReply(new Headers({ "auto-submitted": "auto-generated" }), "Thanks for applying")).toBe(false);
    expect(saysTheyLeft("Thanks for your email. I am no longer with Zephyr Labs.")).toBe(true);
    expect(saysTheyLeft("I'm out of the office until Monday.")).toBe(false);
  });

  async function wroteTo(env: Env, contact: ReturnType<typeof setup>["contact"], sent: ReturnType<typeof setup>["sent"]) {
    contact("c1", "zephyr", "jane@zephyrlabs.example", { name: "Jane Doe" });
    contact("c2", "other", "pat@otherco.example", { name: "Pat Jones" });
    const thread = await sent("u1", { contactId: "c1" });
    return { thread, inbox: await getOrCreateInbox(env.DB, "u1") };
  }

  it("marks an address the user wrote to bounced, and nothing else", async () => {
    const { env, contact, status, sqlite, sent } = setup();
    const { inbox } = await wroteTo(env, contact, sent);
    await handleInboundEmail(message(inbox.address, mime({
      From: "Mail Delivery Subsystem <mailer-daemon@googlemail.com>",
      To: "me@gmail.com",
      Subject: "Delivery Status Notification (Failure)",
    }, "Address not found. Your message wasn't delivered to jane@zephyrlabs.example because the address couldn't be found. Also mentions pat@otherco.example.")), env);
    expect([status("c1"), status("c2")]).toEqual(["bounced", "listed"]);
    expect((sqlite.query("SELECT status FROM outreach_threads").get() as { status: string }).status).toBe("stopped");
  });

  it("doesn't count an out-of-office as a reply, and drops someone who left", async () => {
    const { env, contact, status, sent } = setup();
    const { thread, inbox } = await wroteTo(env, contact, sent);
    const autoReply = (body: string) => message(inbox.address, mime({
      From: "Jane Doe <jane@zephyrlabs.example>",
      To: "me@gmail.com",
      Subject: "Automatic reply: Software Engineer, New Grad - Ali Arslan",
      "Auto-Submitted": "auto-replied",
    }, body));
    await handleInboundEmail(autoReply("I'm out of the office until Monday."), env);
    expect((await loadThread(env.DB, "u1", thread.id))?.status).toBe("active");
    expect(status("c1")).toBe("listed");
    await handleInboundEmail(autoReply("I am no longer with Zephyr Labs. Please write to careers@zephyrlabs.example."), env);
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

describe("routes", () => {
  it("confirm in Recruiters, see them on People, import as an admin", async () => {
    const mail: Array<{ text?: string }> = [];
    const { env, sqlite, candidate } = setup({
      OUTREACH: "admin",
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
    expect((await call("/outreach/companies/zephyr/people")).status).toBe(404);

    sqlite.run("UPDATE users SET role = 'admin' WHERE id = (SELECT user_id FROM auth_identities WHERE provider_subject = 'owner@example.com')");
    candidate("dana");
    const labelled = await call("/recruiters/candidates/dana", { method: "PUT", body: JSON.stringify({ works_there: "yes" }) });
    expect(labelled.status).toBe(200);
    const { people } = await (await call("/outreach/companies/zephyr/people")).json() as { people: Array<{ id: string; name: string; linkedin_url: string }> };
    expect(people.map((person) => [person.name, person.linkedin_url])).toEqual([["Dana Whitfield", "https://www.linkedin.com/in/dana"]]);
    const opened = await call("/outreach/threads", { method: "POST", body: JSON.stringify({ contact_id: people[0]!.id }) });
    expect(opened.status).toBe(201);
    expect((await opened.json() as { contact: { email: string; linkedin_url: string } }).contact).toMatchObject({
      email: "dana.whitfield@zephyrlabs.example", linkedin_url: "https://www.linkedin.com/in/dana",
    });

    const imported = await call("/contacts/import", { method: "POST", type: "text/csv", body: "company,email,name\nco1.example,lee@co1.example,Lee Park\n" });
    expect(await imported.json()).toMatchObject({ dry_run: false, added: 1 });
    const listed = await (await call("/contacts?status=listed")).json() as { contacts: Array<{ email: string }> };
    expect(listed.contacts.map((row) => row.email).sort()).toEqual(["dana.whitfield@zephyrlabs.example", "lee@co1.example"]);
  });
});
