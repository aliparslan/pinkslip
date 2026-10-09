import { describe, expect, it } from "bun:test";
import { Hono } from "hono";
import { createEmptyResumeProfile, type ResumeProfile } from "../shared/resume-profile";
import { nextOutreachMessage, outreachMailtoUrl } from "../shared/outreach";
import { contactRank, rankedContactsForCompany, RECIPIENT_WEEKLY_CAP } from "../worker/outreach/contacts";
import { draftOutreachSequence } from "../worker/outreach/drafts";
import { followUpReminderPayload, remindDueFollowUps } from "../worker/outreach/reminders";
import { addBusinessDaysAt, followUpDueAt, testFollowUpMinutes, validTimeZone } from "../worker/outreach/schedule";
import {
  closeThread,
  discardDraftThread,
  editMessage,
  listThreads,
  markMessageSent,
  OutreachError,
  startThreadForJob,
} from "../worker/outreach/threads";
import outreachRoutes from "../worker/routes/outreach";
import { flagEnabled } from "../worker/feature-flags";
import type { Env, Variables } from "../worker/types";
import { sqliteD1 } from "./sqlite-d1";

async function outreachDb() {
  const { sqlite, db } = sqliteD1();
  sqlite.run("PRAGMA foreign_keys = ON");
  sqlite.run(`CREATE TABLE users (id TEXT PRIMARY KEY, name TEXT NOT NULL DEFAULT '', role TEXT NOT NULL DEFAULT 'user')`);
  sqlite.run(`CREATE TABLE companies (id TEXT PRIMARY KEY, name TEXT NOT NULL)`);
  sqlite.run(`CREATE TABLE jobs (id TEXT PRIMARY KEY, company_id TEXT NOT NULL, title TEXT NOT NULL)`);
  sqlite.run(`CREATE TABLE user_profiles (user_id TEXT PRIMARY KEY, data TEXT NOT NULL, created_at TEXT, updated_at TEXT)`);
  sqlite.run(`CREATE TABLE push_subscriptions (id TEXT PRIMARY KEY, user_id TEXT, endpoint TEXT, p256dh TEXT, auth TEXT, created_at TEXT, platform TEXT)`);
  sqlite.run(await Bun.file(new URL("../migrations/0084_outreach.sql", import.meta.url)).text());
  sqlite.run(`INSERT INTO users (id, name) VALUES ('user-1', 'Ali Arslan'), ('user-2', ''), ('user-3', ''), ('user-4', ''), ('user-5', '')`);
  sqlite.run(`INSERT INTO companies (id, name) VALUES ('stripe', 'Stripe')`);
  sqlite.run(`INSERT INTO jobs (id, company_id, title) VALUES ('job-1', 'stripe', 'Software Engineer, New Grad')`);
  return { sqlite, db };
}

function envWith(db: D1Database, overrides: Partial<Env> = {}): Env {
  return {
    DB: db,
    OUTREACH_TEST_RECIPIENT: "Me@Example.com",
    VAPID_PUBLIC_KEY: "",
    VAPID_PRIVATE_KEY: "",
    VAPID_SUBJECT: "",
    ...overrides,
  } as Env;
}

function profile(overrides: Partial<ResumeProfile> = {}): ResumeProfile {
  return { ...createEmptyResumeProfile(), ...overrides };
}

describe("follow-up schedule", () => {
  it("counts business days and lands at 9am in the sender's time zone", () => {
    // Thursday 2026-10-08 at 4pm in New York.
    const sent = new Date("2026-10-08T20:00:00Z");
    // Three business days later is Tuesday the 13th, 9am EDT.
    expect(addBusinessDaysAt(sent, 3, "America/New_York").toISOString()).toBe("2026-10-13T13:00:00.000Z");
    expect(addBusinessDaysAt(sent, 3, "America/Los_Angeles").toISOString()).toBe("2026-10-13T16:00:00.000Z");
  });

  it("uses the sender's local date, not UTC's", () => {
    // Friday 9pm in Los Angeles is already Saturday in UTC.
    const sent = new Date("2026-10-10T04:00:00Z");
    expect(addBusinessDaysAt(sent, 1, "America/Los_Angeles").toISOString()).toBe("2026-10-12T16:00:00.000Z");
  });

  it("stays on 9am across a daylight saving change", () => {
    // Friday 2026-10-30; New York falls back on Sunday 2026-11-01.
    const sent = new Date("2026-10-30T15:00:00Z");
    expect(addBusinessDaysAt(sent, 1, "America/New_York").toISOString()).toBe("2026-11-02T14:00:00.000Z");
  });

  it("follows up after 3 business days, then 5 more", () => {
    const sent = new Date("2026-10-08T20:00:00Z");
    expect(followUpDueAt(sent, 1, "America/New_York").toISOString()).toBe("2026-10-13T13:00:00.000Z");
    expect(followUpDueAt(sent, 2, "America/New_York").toISOString()).toBe("2026-10-15T13:00:00.000Z");
  });

  it("lets testers shrink the delays to minutes", () => {
    const sent = new Date("2026-10-08T20:00:00Z");
    expect(testFollowUpMinutes("2, 5")).toEqual([2, 5]);
    expect(testFollowUpMinutes("2")).toBeNull();
    expect(testFollowUpMinutes("0,5")).toBeNull();
    expect(followUpDueAt(sent, 2, "America/New_York", [2, 5]).toISOString()).toBe("2026-10-08T20:05:00.000Z");
  });

  it("falls back to Eastern time for a missing or invalid zone", () => {
    expect(validTimeZone("Europe/Berlin")).toBe("Europe/Berlin");
    expect(validTimeZone("Not/AZone")).toBe("America/New_York");
    expect(validTimeZone(undefined)).toBe("America/New_York");
  });
});

describe("drafts", () => {
  const student = profile({
    contact: { ...createEmptyResumeProfile().contact, name: "Ali Arslan", linkedin: "linkedin.com/in/ali" },
    education: [{
      id: "edu",
      institution: "UT Austin",
      credentials: [{ id: "c", degreeType: "bachelor", fieldsOfStudy: ["Computer Science"] }],
      minors: [],
      location: "Austin, TX",
      startDate: "Aug 2023",
      endDate: "May 2027",
    }],
    experience: [{
      id: "exp",
      company: "Ramp",
      title: "Software Engineer Intern",
      location: "",
      startDate: "May 2026",
      endDate: "Aug 2026",
      bullets: [],
    }],
  });

  it("writes a short first email from the resume", () => {
    const [first] = draftOutreachSequence({
      profile: student,
      accountName: "",
      contactName: "Jane Doe",
      jobTitle: "Software Engineer, New Grad",
      companyName: "Stripe",
      now: new Date("2026-10-08T00:00:00Z"),
    });
    expect(first.subject).toBe("Software Engineer, New Grad — Ali Arslan");
    expect(first.body).toBe([
      "Hi Jane,",
      "",
      "I'm Ali Arslan, a Computer Science student at UT Austin, graduating in May 2027. I applied for the Software Engineer, New Grad role at Stripe and wanted to reach out directly. Most recently I was a Software Engineer Intern at Ramp.",
      "",
      "Would you be open to a quick chat, or pointing me to the right person on the team?",
      "",
      "Thanks,",
      "Ali Arslan",
      "linkedin.com/in/ali",
    ].join("\n"));
  });

  it("replies in the same subject for both follow-ups", () => {
    const drafts = draftOutreachSequence({
      profile: student,
      accountName: "",
      contactName: "",
      jobTitle: "Data Analyst",
      companyName: "Stripe",
    });
    expect(drafts.map((draft) => draft.step)).toEqual([0, 1, 2]);
    expect(drafts[1].subject).toBe(`Re: ${drafts[0].subject}`);
    expect(drafts[2].subject).toBe(`Re: ${drafts[0].subject}`);
    expect(drafts[1].body.startsWith("Hi there,")).toBe(true);
  });

  it("still drafts something sendable with an empty resume", () => {
    const [first] = draftOutreachSequence({
      profile: profile(),
      accountName: "",
      contactName: "",
      jobTitle: "Product Designer",
      companyName: "Figma",
    });
    expect(first.subject).toBe("Interested in the Product Designer role");
    expect(first.body).toContain("I'm reaching out. I applied for the Product Designer role at Figma");
    expect(first.body.endsWith("Thanks,")).toBe(true);
  });

  it("speaks of graduation in the past once it has happened", () => {
    const [first] = draftOutreachSequence({
      profile: { ...student, education: [{ ...student.education[0], endDate: "May 2025" }] },
      accountName: "",
      contactName: "",
      jobTitle: "Engineer",
      companyName: "Stripe",
      now: new Date("2026-10-08T00:00:00Z"),
    });
    expect(first.body).toContain("a recent UT Austin graduate in Computer Science.");
  });
});

describe("contacts", () => {
  it("ranks early-career recruiters first", () => {
    expect(contactRank("University Recruiter")).toBe(0);
    expect(contactRank("Technical Recruiter")).toBe(1);
    expect(contactRank("Talent Partner")).toBe(2);
    expect(contactRank("HR Generalist")).toBe(3);
    expect(contactRank("Software Engineer")).toBe(4);
  });

  it("uses the test recipient as every company's recruiter", async () => {
    const { db } = await outreachDb();
    const contacts = await rankedContactsForCompany(envWith(db), "stripe", "user-1");
    expect(contacts.map((contact) => [contact.email, contact.source])).toEqual([["me@example.com", "test"]]);
    // Asking again does not duplicate it.
    expect(await rankedContactsForCompany(envWith(db), "stripe", "user-1")).toHaveLength(1);
  });

  it("finds nobody without a test recipient or a directory", async () => {
    const { db } = await outreachDb();
    const env = envWith(db, { OUTREACH_TEST_RECIPIENT: undefined });
    expect(await rankedContactsForCompany(env, "stripe", "user-1")).toEqual([]);
    await expect(startThreadForJob(env, "user-1", "job-1")).rejects.toMatchObject({ code: "no_contacts" });
  });

  it("rests a recruiter who already heard from enough users this week", async () => {
    const { db } = await outreachDb();
    const env = envWith(db);
    const now = new Date("2026-10-08T12:00:00Z");
    for (const userId of ["user-2", "user-3", "user-4"].slice(0, RECIPIENT_WEEKLY_CAP)) {
      const thread = await startThreadForJob(env, userId, "job-1", now);
      await markMessageSent(env, userId, thread.messages[0].id, "America/New_York", now);
    }
    expect(await rankedContactsForCompany(env, "stripe", "user-5", now)).toEqual([]);
    // The cap counts other users; someone already in a thread still sees the contact.
    expect(await rankedContactsForCompany(env, "stripe", "user-2", now)).toHaveLength(1);
    // A week later the recruiter is available again.
    expect(await rankedContactsForCompany(env, "stripe", "user-5", new Date("2026-10-16T12:00:00Z"))).toHaveLength(1);
  });
});

describe("threads", () => {
  it("drafts the whole sequence and reuses the thread on a second start", async () => {
    const { db } = await outreachDb();
    const env = envWith(db);
    const thread = await startThreadForJob(env, "user-1", "job-1");
    expect(thread.status).toBe("draft");
    expect(thread.contact).toEqual({ name: "", email: "me@example.com", title: "Recruiter (test)", test: true });
    expect(thread.messages.map((message) => [message.step, message.status])).toEqual([
      [0, "draft"], [1, "draft"], [2, "draft"],
    ]);
    expect(thread.messages[0].subject).toBe("Software Engineer, New Grad — Ali Arslan");
    expect(nextOutreachMessage(thread)?.step).toBe(0);
    expect((await startThreadForJob(env, "user-1", "job-1")).id).toBe(thread.id);
    expect((await listThreads(db, "user-1", { jobId: "job-1" })).map((item) => item.id)).toEqual([thread.id]);
    expect(await listThreads(db, "user-2")).toEqual([]);
  });

  it("schedules each follow-up once the email before it is sent", async () => {
    const { db } = await outreachDb();
    const env = envWith(db);
    const thread = await startThreadForJob(env, "user-1", "job-1");
    const [first, second, third] = thread.messages;

    await expect(markMessageSent(env, "user-1", second.id, null)).rejects.toMatchObject({ code: "out_of_order" });

    const afterFirst = await markMessageSent(env, "user-1", first.id, "America/New_York", new Date("2026-10-08T20:00:00Z"));
    expect(afterFirst.status).toBe("active");
    expect(afterFirst.messages[1]).toMatchObject({ status: "scheduled", due_at: "2026-10-13T13:00:00.000Z" });
    expect(afterFirst.messages[2].status).toBe("draft");
    expect(nextOutreachMessage(afterFirst)?.step).toBe(1);

    const afterSecond = await markMessageSent(env, "user-1", second.id, null, new Date("2026-10-13T15:00:00Z"));
    expect(afterSecond.messages[1]).toMatchObject({ status: "sent", due_at: null, sent_at: "2026-10-13T15:00:00.000Z" });
    expect(afterSecond.messages[2]).toMatchObject({ status: "scheduled", due_at: "2026-10-20T13:00:00.000Z" });

    const finished = await markMessageSent(env, "user-1", third.id, null, new Date("2026-10-20T14:00:00Z"));
    expect(finished.status).toBe("finished");
    expect(nextOutreachMessage(finished)).toBeNull();
  });

  it("treats a repeated sent tap as done", async () => {
    const { db } = await outreachDb();
    const env = envWith(db);
    const thread = await startThreadForJob(env, "user-1", "job-1");
    const first = await markMessageSent(env, "user-1", thread.messages[0].id, "America/Chicago");
    const again = await markMessageSent(env, "user-1", thread.messages[0].id, "Europe/Paris");
    expect(again.messages[1].due_at).toBe(first.messages[1].due_at);
  });

  it("edits drafts but not sent emails", async () => {
    const { db } = await outreachDb();
    const env = envWith(db);
    const thread = await startThreadForJob(env, "user-1", "job-1");
    const edited = await editMessage(db, "user-1", thread.messages[0].id, { body: "  Hi!  " });
    expect(edited.messages[0].body).toBe("Hi!");
    await expect(editMessage(db, "user-1", thread.messages[0].id, { subject: " " }))
      .rejects.toMatchObject({ code: "invalid_message" });
    await markMessageSent(env, "user-1", thread.messages[0].id, null);
    await expect(editMessage(db, "user-1", thread.messages[0].id, { body: "Changed" }))
      .rejects.toMatchObject({ code: "message_closed" });
    await expect(editMessage(db, "user-2", thread.messages[1].id, { body: "Not mine" }))
      .rejects.toBeInstanceOf(OutreachError);
  });

  it("stops follow-ups once the recruiter replies", async () => {
    const { db } = await outreachDb();
    const env = envWith(db);
    const thread = await startThreadForJob(env, "user-1", "job-1");
    await markMessageSent(env, "user-1", thread.messages[0].id, null);
    const replied = await closeThread(db, "user-1", thread.id, "replied");
    expect(replied.status).toBe("replied");
    expect(replied.messages.map((message) => message.status)).toEqual(["sent", "skipped", "skipped"]);
    await expect(markMessageSent(env, "user-1", thread.messages[1].id, null)).rejects.toMatchObject({ code: "thread_closed" });
  });

  it("discards only threads that never sent anything", async () => {
    const { db } = await outreachDb();
    const env = envWith(db);
    const thread = await startThreadForJob(env, "user-1", "job-1");
    await discardDraftThread(db, "user-1", thread.id);
    expect(await listThreads(db, "user-1")).toEqual([]);

    const again = await startThreadForJob(env, "user-1", "job-1");
    await markMessageSent(env, "user-1", again.messages[0].id, null);
    await expect(discardDraftThread(db, "user-1", again.id)).rejects.toMatchObject({ code: "thread_started" });
  });
});

describe("reminders", () => {
  it("claims each due follow-up once", async () => {
    const { db, sqlite } = await outreachDb();
    const env = envWith(db);
    const thread = await startThreadForJob(env, "user-1", "job-1");
    await markMessageSent(env, "user-1", thread.messages[0].id, "America/New_York", new Date("2026-10-08T20:00:00Z"));

    expect(await remindDueFollowUps(env, new Date("2026-10-13T12:59:00Z"))).toEqual({ reminded: 0, delivered: 0 });
    expect(await remindDueFollowUps(env, new Date("2026-10-13T13:00:00Z"))).toEqual({ reminded: 1, delivered: 0 });
    expect(await remindDueFollowUps(env, new Date("2026-10-13T13:01:00Z"))).toEqual({ reminded: 0, delivered: 0 });
    expect(sqlite.query("SELECT reminded_at FROM outreach_messages WHERE step = 1").get())
      .toEqual({ reminded_at: "2026-10-13T13:00:00.000Z" });
  });

  it("skips threads that are no longer active", async () => {
    const { db } = await outreachDb();
    const env = envWith(db);
    const thread = await startThreadForJob(env, "user-1", "job-1");
    await markMessageSent(env, "user-1", thread.messages[0].id, null, new Date("2026-10-08T20:00:00Z"));
    await closeThread(db, "user-1", thread.id, "stopped");
    expect(await remindDueFollowUps(env, new Date("2026-11-01T00:00:00Z"))).toEqual({ reminded: 0, delivered: 0 });
  });

  it("links the reminder to the thread on its job page", () => {
    expect(followUpReminderPayload({
      thread_id: "t-1",
      step: 1,
      job_id: "job-1",
      company_name: "Stripe",
      contact_name: "Jane Doe",
    })).toEqual({
      title: "Follow up with Stripe",
      body: "Your follow-up to Jane is ready to send.",
      data: { url: "/jobs/job-1?outreach=t-1" },
    });
  });
});

describe("mailto links", () => {
  it("encodes the subject and body for the user's mail app", () => {
    expect(outreachMailtoUrl("jane+jobs@stripe.com", { subject: "Hi & hello", body: "Line one\nLine two" }))
      .toBe("mailto:jane%2Bjobs@stripe.com?subject=Hi%20%26%20hello&body=Line%20one%0ALine%20two");
  });
});

describe("routes", () => {
  function appFor(sessionState: Variables["sessionState"]) {
    const app = new Hono<{ Bindings: Env; Variables: Variables }>();
    app.use("*", async (c, next) => {
      c.set("userId", "user-1");
      c.set("sessionId", null);
      c.set("sessionState", sessionState);
      c.set("authTransport", "native");
      await next();
    });
    app.route("/outreach", outreachRoutes);
    return app;
  }

  async function call(env: Env, path: string, init?: RequestInit, sessionState: Variables["sessionState"] = "authenticated") {
    return (appFor(sessionState).fetch as unknown as (request: Request, env: Env) => Promise<Response>)(
      new Request(`https://pinkslip.test${path}`, init),
      env,
    );
  }

  it("reads the flag", () => {
    expect(flagEnabled("on", false)).toBe(true);
    expect(flagEnabled(" Admin ", false)).toBe(false);
    expect(flagEnabled("admin", true)).toBe(true);
    expect(flagEnabled(undefined, true)).toBe(false);
  });

  it("hides outreach while the flag is off and from guests", async () => {
    const { db } = await outreachDb();
    expect((await call(envWith(db), "/outreach/threads")).status).toBe(404);
    expect((await call(envWith(db, { OUTREACH: "on" }), "/outreach/threads", undefined, "guest")).status).toBe(401);
  });

  it("starts, edits, and sends through the API", async () => {
    const { db } = await outreachDb();
    const env = envWith(db, { OUTREACH: "on", OUTREACH_FOLLOW_UP_MINUTES: "2,4" });
    const created = await call(env, "/outreach/threads", {
      method: "POST",
      body: JSON.stringify({ job_id: "job-1" }),
    });
    expect(created.status).toBe(201);
    const thread = await created.json() as { id: string; messages: Array<{ id: string }> };

    const edited = await call(env, `/outreach/messages/${thread.messages[0].id}`, {
      method: "PATCH",
      body: JSON.stringify({ subject: "Hello" }),
    });
    expect(((await edited.json()) as { messages: Array<{ subject: string }> }).messages[0].subject).toBe("Hello");

    const sent = await call(env, `/outreach/messages/${thread.messages[0].id}/sent`, {
      method: "POST",
      body: JSON.stringify({ time_zone: "America/New_York" }),
    });
    const afterSend = await sent.json() as { status: string; messages: Array<{ status: string; due_at: string | null }> };
    expect(afterSend.status).toBe("active");
    expect(afterSend.messages[1].status).toBe("scheduled");
    const minutesOut = (Date.parse(afterSend.messages[1].due_at!) - Date.now()) / 60_000;
    expect(minutesOut).toBeGreaterThan(1.9);
    expect(minutesOut).toBeLessThanOrEqual(2);

    const listed = await call(env, "/outreach/threads?job_id=job-1");
    expect(((await listed.json()) as { threads: unknown[] }).threads).toHaveLength(1);

    const missing = await call(env, "/outreach/threads/nope");
    expect(missing.status).toBe(404);

    const deleteStarted = await call(env, `/outreach/threads/${thread.id}`, { method: "DELETE" });
    expect(deleteStarted.status).toBe(409);
  });
});
