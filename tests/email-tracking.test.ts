import { Database } from "bun:sqlite";
import { afterEach, describe, expect, it } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { Hono } from "hono";
import { legacySaveJob, trackJob } from "@worker/applications";
import { handleInboundEmail } from "@worker/email/handler";
import { emailMovesStage, expireNeedsChoice } from "@worker/email/process";
import { getOrCreateInbox } from "@worker/inbox";
import inboxRoutes from "@worker/routes/inbox";
import type { Env, Variables } from "@worker/types";
import { sqliteD1 } from "./sqlite-d1";

const migrationsDir = new URL("../migrations/", import.meta.url).pathname;
const databases: Database[] = [];
afterEach(() => {
  for (const db of databases.splice(0)) db.close();
});

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
  return {
    from: "forwarder@gmail.com",
    to,
    headers,
    raw: new Response(bytes).body!,
    rawSize: bytes.length,
  } as unknown as ForwardableEmailMessage;
}

async function setup() {
  const { sqlite, db } = sqliteD1();
  databases.push(sqlite);
  for (const file of readdirSync(migrationsDir).filter((name) => name.endsWith(".sql")).sort()) {
    sqlite.exec(readFileSync(`${migrationsDir}${file}`, "utf8"));
  }
  sqlite.exec("PRAGMA foreign_keys = ON");
  sqlite.run("INSERT INTO users (id) VALUES ('u1'), ('u2')");
  sqlite.run(`INSERT INTO companies (id, name, ats_type, ats_slug, website)
    VALUES ('zephyr', 'Zephyr Labs', 'greenhouse', 'zephyrlabs-test', 'https://zephyrlabs.example')`);
  for (const [id, title, externalId] of [
    ["z1", "Software Engineer, New Grad", "9100001"],
    ["z2", "Software Engineer", "9100002"],
    ["z3", "Data Scientist", "9100003"],
  ]) {
    sqlite.run(`INSERT INTO jobs (id, company_id, external_id, title, url, location)
      VALUES ('${id}', 'zephyr', '${externalId}', '${title}', 'https://boards.greenhouse.io/zephyrlabs-test/jobs/${externalId}', 'New York, NY')`);
  }
  const env = { DB: db } as Env;
  const inbox = await getOrCreateInbox(db, "u1");
  const send = (raw: string, to = inbox.address) => handleInboundEmail(message(to, raw), env);
  const app = new Hono<{ Bindings: Env; Variables: Variables }>();
  app.use("*", async (c, next) => {
    c.set("userId", c.req.header("x-user") ?? "u1");
    c.set("sessionState", (c.req.header("x-state") ?? "authenticated") as Variables["sessionState"]);
    c.set("sessionId", null);
    await next();
  });
  app.route("/inbox", inboxRoutes);
  const call = async (path: string, init: RequestInit & { state?: string } = {}) => {
    const response = await app.request(path, {
      ...init,
      headers: { "content-type": "application/json", "x-state": init.state ?? "authenticated" },
    }, env);
    return { status: response.status, body: await response.json() as any };
  };
  const applications = () => sqlite.query("SELECT job_id, stage FROM applications WHERE user_id = 'u1' ORDER BY job_id").all();
  const records = () => sqlite.query("SELECT detected_stage, status FROM inbound_emails ORDER BY created_at, rowid").all();
  return { sqlite, db, inbox, send, call, applications, records };
}

const greenhouse = (subject: string, body: string, messageId: string) => mime({
  From: "Zephyr Labs <no-reply@us.greenhouse-mail.io>",
  To: "alex@gmail.com",
  Subject: subject,
  "Message-ID": `<${messageId}@greenhouse>`,
  Date: "Mon, 12 Oct 2026 15:04:00 +0000",
}, body);

describe("stage moves from email", () => {
  it("only moves forward or to an ending; Ghosted revives", () => {
    expect(emailMovesStage("saved", "applied")).toBe(true);
    expect(emailMovesStage("interview", "applied")).toBe(false);
    expect(emailMovesStage("interview", "rejected")).toBe(true);
    expect(emailMovesStage("rejected", "interview")).toBe(false);
    expect(emailMovesStage("withdrawn", "offer")).toBe(false);
    expect(emailMovesStage("ghosted", "interview")).toBe(true);
  });
});

describe("inbox address", () => {
  it("is created on first use, can be replaced, and needs a signed-in account", async () => {
    const { call } = await setup();
    const first = await call("/inbox");
    expect(first.body.address).toMatch(/^inbox\+[a-z2-9]{10}@pinkslip\.work$/);
    expect((await call("/inbox")).body.address).toBe(first.body.address);
    const rotated = await call("/inbox/rotate", { method: "POST" });
    expect(rotated.body.address).not.toBe(first.body.address);
    expect((await call("/inbox", { state: "guest" })).status).toBe(401);
  });
});

describe("forwarded email", () => {
  it("keeps Gmail's confirmation code until forwarding works", async () => {
    const { send, call } = await setup();
    await send(mime({
      From: "Gmail Team <forwarding-noreply@google.com>",
      Subject: "(#418523977) Gmail Forwarding Confirmation - Receive Mail from alex@gmail.com",
    }, "Confirmation code: 418523977\nhttps://mail-settings.google.com/mail/vf-%5BAB%5D-xyz"));
    expect((await call("/inbox")).body.forwarding).toEqual({
      confirmed_at: null, code: "418523977", link: "https://mail-settings.google.com/mail/vf-%5BAB%5D-xyz",
    });
    await send(mime({ From: "Spotify <no-reply@spotify.com>", Subject: "Your Daily Mix" }, "Songs"));
    const confirmed = (await call("/inbox")).body;
    expect(confirmed.forwarding.confirmed_at).toBeString();
    expect(confirmed.forwarding.code).toBeNull();
    expect(confirmed.last_email_at).toBeString();
  });

  it("starts tracking a catalog job from its receipt, once, and moves it on later emails", async () => {
    const { send, applications, records, sqlite } = await setup();
    const receipt = greenhouse(
      "Thank you for applying to Zephyr Labs",
      "Hi Alex, thanks for applying for the Software Engineer, New Grad position. If your experience matches, we'll reach out to schedule an interview.\n"
        + "https://boards.greenhouse.io/zephyrlabs-test/jobs/9100001",
      "receipt-1"
    );
    await send(receipt);
    await send(receipt);
    expect(applications()).toEqual([{ job_id: "z1", stage: "applied" }]);
    expect(records()).toEqual([{ detected_stage: "applied", status: "created" }]);
    expect(sqlite.query("SELECT stage, source, inbound_email_id IS NOT NULL AS linked FROM application_events").all())
      .toEqual([{ stage: "applied", source: "email", linked: 1 }]);

    await send(greenhouse("Next steps for Software Engineer, New Grad", "We'd like to invite you to a phone screen.", "invite-1"));
    expect(applications()).toEqual([{ job_id: "z1", stage: "interview" }]);
    // A late receipt doesn't move it back.
    await send(greenhouse("Application received", "Thank you for applying for Software Engineer, New Grad.", "receipt-2"));
    expect(applications()).toEqual([{ job_id: "z1", stage: "interview" }]);
    expect(records().map((row: any) => row.status)).toEqual(["created", "applied", "unchanged"]);
  });

  it("asks which application a generic rejection is about, then records the answer", async () => {
    const { db, send, call, applications } = await setup();
    await trackJob(db, "u1", "z2", "applied");
    await trackJob(db, "u1", "z3", "applied");
    await send(greenhouse("Your application to Zephyr Labs", "Unfortunately, we will not be moving forward with your application.", "reject-1"));
    expect(applications()).toEqual([{ job_id: "z2", stage: "applied" }, { job_id: "z3", stage: "applied" }]);

    const pending = (await call("/inbox/emails?status=needs_choice")).body.emails;
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({ detected_stage: "rejected", company_name: "Zephyr Labs", subject: "Your application to Zephyr Labs" });
    expect(pending[0].candidates.map((candidate: { title: string }) => candidate.title).sort()).toEqual(["Data Scientist", "Software Engineer"]);

    const chosen = pending[0].candidates.find((candidate: { title: string }) => candidate.title === "Data Scientist").id;
    expect((await call(`/inbox/emails/${pending[0].id}/assign`, { method: "POST", body: JSON.stringify({ application_id: "nope" }) })).status).toBe(400);
    expect((await call(`/inbox/emails/${pending[0].id}/assign`, { method: "POST", body: JSON.stringify({ application_id: chosen }) })).status).toBe(200);
    expect(applications()).toEqual([{ job_id: "z2", stage: "applied" }, { job_id: "z3", stage: "rejected" }]);
    expect((await call(`/inbox/emails/${pending[0].id}/assign`, { method: "POST", body: JSON.stringify({ application_id: chosen }) })).status).toBe(409);
  });

  it("files one email to several applications, and undoes them one at a time", async () => {
    const { db, sqlite, send, call, applications, records } = await setup();
    await trackJob(db, "u1", "z2", "applied");
    await trackJob(db, "u1", "z3", "applied");
    await send(greenhouse("Your application to Zephyr Labs", "Unfortunately, we will not be moving forward with your application.", "reject-2"));
    const [pending] = (await call("/inbox/emails?status=needs_choice")).body.emails;
    const ids = pending.candidates.map((candidate: { id: string }) => candidate.id);
    const assign = (body: unknown) => call(`/inbox/emails/${pending.id}/assign`, { method: "POST", body: JSON.stringify(body) });
    expect((await assign({ application_ids: [] })).status).toBe(400);
    expect((await assign({ application_ids: [ids[0], "nope"] })).status).toBe(400);
    expect((await assign({ application_ids: ids })).status).toBe(200);
    expect(applications()).toEqual([{ job_id: "z2", stage: "rejected" }, { job_id: "z3", stage: "rejected" }]);

    const idFor = (jobId: string) => (sqlite.query("SELECT id FROM applications WHERE job_id = ?").get(jobId) as { id: string }).id;
    const undo = (applicationId: string) =>
      call(`/inbox/emails/${pending.id}/undo`, { method: "POST", body: JSON.stringify({ application_id: applicationId }) });
    expect((await undo(idFor("z3"))).status).toBe(200);
    expect(applications()).toEqual([{ job_id: "z2", stage: "rejected" }, { job_id: "z3", stage: "applied" }]);
    expect(records().at(-1)).toMatchObject({ status: "assigned" });
    expect((await undo(idFor("z3"))).status).toBe(409);
    expect((await undo(idFor("z2"))).status).toBe(200);
    expect(applications()).toEqual([{ job_id: "z2", stage: "applied" }, { job_id: "z3", stage: "applied" }]);
    expect(records().at(-1)).toMatchObject({ status: "undone" });
  });

  it("undoes an email's step, and removes an application the email started", async () => {
    const { db, send, call, applications } = await setup();
    await legacySaveJob(db, "u1", "z2");
    await send(greenhouse("Interview for Software Engineer", "We'd like to invite you to a phone screen.", "invite-2"));
    expect(applications()).toEqual([{ job_id: "z2", stage: "interview" }]);
    const [invite] = (await call("/inbox/emails")).body.emails;
    expect((await call(`/inbox/emails/${invite.id}/undo`, { method: "POST" })).status).toBe(200);
    expect(applications()).toEqual([{ job_id: "z2", stage: "saved" }]);
    expect((await call(`/inbox/emails/${invite.id}/undo`, { method: "POST" })).status).toBe(409);

    await send(greenhouse("Thanks for applying", "Thank you for applying to the Data Scientist role.\nhttps://boards.greenhouse.io/zephyrlabs-test/jobs/9100003", "receipt-3"));
    expect(applications()).toEqual([{ job_id: "z2", stage: "saved" }, { job_id: "z3", stage: "applied" }]);
    const created = (await call("/inbox/emails")).body.emails.find((email: { status: string }) => email.status === "created");
    await call(`/inbox/emails/${created.id}/undo`, { method: "POST" });
    expect(applications()).toEqual([{ job_id: "z2", stage: "saved" }]);
  });

  it("files an email about another role at the company under that role, not the one already tracked", async () => {
    const { db, send, applications, records } = await setup();
    await trackJob(db, "u1", "z2", "applied");
    await send(greenhouse("Thank you for applying", "Thanks for applying for the Software Engineer, New Grad position.", "receipt-4"));
    expect(applications()).toEqual([{ job_id: "z1", stage: "applied" }, { job_id: "z2", stage: "applied" }]);
    // With two applications there now, a generic invite asks instead of guessing.
    await send(greenhouse("Update from Zephyr Labs", "We'd like to invite you to a phone screen.", "invite-3"));
    expect(applications()).toEqual([{ job_id: "z1", stage: "applied" }, { job_id: "z2", stage: "applied" }]);
    expect(records().map((row: any) => row.status)).toEqual(["created", "needs_choice"]);
  });

  it("keeps nothing from mail that isn't about a tracked or catalog job, or from an unknown address", async () => {
    const { send, records, applications } = await setup();
    await send(mime({ From: "Chase <no.reply@chase.com>", Subject: "Your application for a credit card" }, "Thank you for applying for a Chase card."));
    await send(greenhouse("Thank you for applying to Zephyr Labs", "Thanks for applying.", "generic-1"));
    await send(greenhouse("Thank you for applying", "Thanks for applying for the Software Engineer role.", "wrong-tag"), "inbox+zzzzzzzzzz@pinkslip.work");
    expect(records()).toEqual([]);
    expect(applications()).toEqual([]);
  });

  it("expires unanswered prompts after 30 days", async () => {
    const { db, sqlite } = await setup();
    sqlite.run(`INSERT INTO inbound_emails (id, user_id, message_hash, received_at, detected_stage, status, created_at)
      VALUES ('old', 'u1', 'h1', '2026-08-01T00:00:00.000Z', 'rejected', 'needs_choice', '2026-08-01T00:00:00.000Z'),
             ('new', 'u1', 'h2', '${new Date().toISOString()}', 'rejected', 'needs_choice', '${new Date().toISOString()}')`);
    await expireNeedsChoice(db);
    expect(sqlite.query("SELECT id FROM inbound_emails").all()).toEqual([{ id: "new" }]);
  });
});
