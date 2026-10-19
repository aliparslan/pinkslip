import { Database } from "bun:sqlite";
import { afterEach, describe, expect, it } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { buildToday } from "@worker/activity";
import { createGuestSession } from "@worker/auth";
import { matchEventCompany, readEventWithAi, readPageBasics, readStructuredEvent } from "@worker/event-import";
import { listCompanyEvents, queueDueEventReminders } from "@worker/events";
import worker from "@worker/index";
import { classifyJob } from "@worker/job-features";
import { notificationJobMatchesCurrentProfile } from "@worker/notification-delivery";
import { buildDailyDigestPayload, buildNotificationPayload } from "@worker/push";
import { ensureUserJobMatches } from "@worker/user-job-matches";
import { saveUserPreferenceState } from "@worker/user-preferences";
import type { Env } from "@worker/types";
import { DEFAULT_SEARCH_PROFILE, normalizeSearchProfile } from "../shared/search-profile";
import { sqliteD1 } from "./sqlite-d1";

const migrationsDir = new URL("../migrations/", import.meta.url).pathname;
const databases: Database[] = [];
const realFetch = globalThis.fetch;
afterEach(() => {
  for (const db of databases.splice(0)) db.close();
  globalThis.fetch = realFetch;
});

const ORIGIN = "https://pinkslip.work";
const NOW = new Date().toISOString();
const NEW_GRAD = "We're hiring new graduates for this role. A bachelor's degree in computer science or a related field. 0-1 years of experience. "
  + "You'll build and ship features with a small team, review code and learn from experienced engineers.";

const JOBS = [
  // In the search: a new-grad software job in New York.
  { id: "swe-ny", title: "Software Engineer, New Grad", location: "New York, NY", description: NEW_GRAD },
  // Outside it twice over: a role not picked, in a city not picked.
  { id: "ml-seattle", title: "Machine Learning Engineer, New Grad", location: "Seattle, WA", description: NEW_GRAD },
  // Above the person's level: following doesn't widen that.
  { id: "ml-senior", title: "Senior Machine Learning Engineer", location: "Seattle, WA",
    description: "Requires 7+ years of professional experience building machine learning systems at scale. You'll lead a team and set direction." },
];

async function setup() {
  const { sqlite, db } = sqliteD1();
  databases.push(sqlite);
  for (const file of readdirSync(migrationsDir).filter((name) => name.endsWith(".sql")).sort()) {
    sqlite.exec(readFileSync(`${migrationsDir}${file}`, "utf8"));
  }
  sqlite.exec("PRAGMA foreign_keys = ON");
  sqlite.run(`INSERT INTO companies (id, name, ats_type, ats_slug, website, enabled)
    VALUES ('zephyr', 'Zephyr Labs', 'greenhouse', 'zephyrlabs-test', 'https://zephyrlabs.example', 1),
           ('other', 'Other Co', 'greenhouse', 'otherco-test', 'https://otherco.example', 1)`);
  for (const job of JOBS) {
    sqlite.query(`INSERT INTO jobs (id, company_id, external_id, title, url, location, posted_at, first_seen_at, description)
      VALUES (?, 'zephyr', ?, ?, ?, ?, ?, ?, ?)`)
      .run(job.id, job.id, job.title, `https://boards.greenhouse.io/zephyrlabs-test/jobs/${job.id}`, job.location, NOW, NOW, job.description);
  }
  const mail: Array<{ to: string; text?: string }> = [];
  const env = {
    DB: db,
    EMAIL: { send: async (message: { to: string; text?: string }) => { mail.push(message); } },
    EMAIL_FROM_ADDRESS: "login@pinkslip.work",
  } as unknown as Env;
  const lastCode = () => mail.at(-1)?.text?.match(/code is (\d{6})/)?.[1] ?? "";
  const pending: Promise<unknown>[] = [];
  const ctx = { waitUntil(promise: Promise<unknown>) { pending.push(promise); }, passThroughOnException() {} } as unknown as ExecutionContext;
  const app = (token: string) => async (path: string, body?: unknown, method = "POST") => {
    const response = await worker.fetch(new Request(`${ORIGIN}${path}`, {
      method,
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json", "x-pinkslip-client": "ios" },
      body: body === undefined ? undefined : JSON.stringify(body),
    }), env, ctx);
    await Promise.all(pending.splice(0));
    return response;
  };
  const guest = async () => {
    const session = await createGuestSession(db);
    return { token: session.id, userId: session.user_id, call: app(session.id) };
  };
  /** Signed in by code, as the iPhone does. */
  const signedIn = async (email: string, role: "user" | "admin" = "user") => {
    const start = await guest();
    await start.call("/api/v2/auth/email/code/start", { email });
    const { native_token: token } = await (await start.call("/api/v2/auth/email/code/verify", { email, code: lastCode() })).json() as { native_token: string };
    const userId = (sqlite.query("SELECT user_id FROM auth_identities WHERE provider_subject = ?").get(email) as { user_id: string }).user_id;
    if (role === "admin") sqlite.run("UPDATE users SET role = 'admin' WHERE id = ?", [userId]);
    return { token, userId, call: app(token) };
  };
  const searchFor = (userId: string) => saveUserPreferenceState(db, userId, {
    search_profile: normalizeSearchProfile({
      ...DEFAULT_SEARCH_PROFILE,
      primary_role: "software_engineering",
      roles: ["software_engineering", "backend"],
      target_levels: ["new_grad"],
      location_ids: ["new_york"],
    }),
  });
  const matched = (userId: string) => (sqlite.query("SELECT job_id FROM user_job_matches WHERE user_id = ? ORDER BY job_id").all(userId) as { job_id: string }[])
    .map((row) => row.job_id);
  return { sqlite, db, env, guest, signedIn, searchFor, matched, lastCode };
}

describe("following a company", () => {
  it("widens matches to its jobs at your level, whatever the role or place, and narrows them again on unfollow", async () => {
    const { sqlite, db, guest, searchFor, matched } = await setup();
    const person = await guest();
    await searchFor(person.userId);
    await ensureUserJobMatches(db, person.userId, JOBS.map((job) => job.id));
    expect(matched(person.userId)).toEqual(["swe-ny"]);

    expect(await (await person.call("/api/v2/interactions/companies/zephyr/follow")).json() as { following: boolean }).toEqual({ following: true });
    expect(matched(person.userId)).toEqual(["ml-seattle", "swe-ny"]);
    const companies = await (await person.call("/api/v2/companies", undefined, "GET")).json() as { companies: Array<{ id: string; following: number }> };
    expect(companies.companies.find((company) => company.id === "zephyr")?.following).toBe(1);
    expect(companies.companies.find((company) => company.id === "other")?.following).toBe(0);
    const job = await (await person.call("/api/v2/jobs/ml-seattle", undefined, "GET")).json() as { following: boolean };
    expect(job.following).toBe(true);

    expect(await (await person.call("/api/v2/interactions/companies/zephyr/follow", undefined, "DELETE")).json() as { following: boolean }).toEqual({ following: false });
    expect(matched(person.userId)).toEqual(["swe-ny"]);
    expect(sqlite.query("SELECT COUNT(*) AS count FROM company_follows").get()).toEqual({ count: 0 });
  });

  it("can't be hidden and followed at once", async () => {
    const { sqlite, guest } = await setup();
    const person = await guest();
    await person.call("/api/v2/interactions/companies/zephyr/block");
    await person.call("/api/v2/interactions/companies/zephyr/follow");
    expect(sqlite.query("SELECT COUNT(*) AS count FROM user_blocked_companies").get()).toEqual({ count: 0 });
    await person.call("/api/v2/interactions/companies/zephyr/block");
    expect(sqlite.query("SELECT COUNT(*) AS count FROM company_follows").get()).toEqual({ count: 0 });
    expect((await person.call("/api/v2/interactions/companies/missing/follow")).status).toBe(404);
  });

  it("keeps a followed job through the alert's last check, and marks it Following (N20)", () => {
    const listing = { externalId: "ml-seattle", title: JOBS[1]!.title, url: "https://example.com", location: "Seattle, WA",
      department: null, postedAt: NOW, description: NEW_GRAD, salary: null };
    const profile = normalizeSearchProfile({ ...DEFAULT_SEARCH_PROFILE, roles: ["software_engineering"], target_levels: ["new_grad"], location_ids: ["new_york"] });
    expect(notificationJobMatchesCurrentProfile("ml-seattle", listing, classifyJob(listing), profile)).toBe(false);
    expect(notificationJobMatchesCurrentProfile("ml-seattle", listing, classifyJob(listing), profile, false, true)).toBe(true);

    expect(buildNotificationPayload([{ company: "Zephyr Labs", title: "ML Engineer", jobId: "j1", following: true }]))
      .toMatchObject({ title: "Zephyr Labs", body: "Following · ML Engineer" });
    expect(buildNotificationPayload([
      { company: "Ramp", title: "SWE", jobId: "j2" },
      { company: "Zephyr Labs", title: "ML Engineer", jobId: "j1", following: true },
    ])).toMatchObject({ title: "2 new jobs", body: "Zephyr Labs, Ramp", data: { url: "/jobs/j1" } });
    expect(buildDailyDigestPayload([{ company: "Zephyr Labs", title: "ML Engineer", jobId: "j1", following: true }]))
      .toMatchObject({ body: "Zephyr Labs · Following · ML Engineer" });
  });

  it("comes along when a guest signs in, with their reminders", async () => {
    const { sqlite, guest, signedIn, lastCode } = await setup();
    const account = await signedIn("jordan@lee.dev");
    sqlite.run(`INSERT INTO company_events (id, company_id, title, starts_at, url, created_at, updated_at)
      VALUES ('ev', 'zephyr', 'Info session', ?, 'https://zephyrlabs.example/events/1', ?, ?)`,
    [new Date(Date.now() + 5 * 86_400_000).toISOString(), NOW, NOW]);
    // Browsing as a guest on another phone, then signing in there.
    const visitor = await guest();
    await visitor.call("/api/v2/interactions/companies/zephyr/follow");
    await visitor.call("/api/v2/events/ev/reminder", undefined, "PUT");
    // One code a minute per email: the first one is spent.
    sqlite.run("DELETE FROM email_login_tokens");
    await visitor.call("/api/v2/auth/email/code/start", { email: "jordan@lee.dev" });
    expect((await visitor.call("/api/v2/auth/email/code/verify", { email: "jordan@lee.dev", code: lastCode() })).status).toBe(200);
    expect(sqlite.query("SELECT user_id, company_id FROM company_follows").all()).toEqual([{ user_id: account.userId, company_id: "zephyr" }]);
    expect(sqlite.query("SELECT user_id, event_id FROM event_reminders").all()).toEqual([{ user_id: account.userId, event_id: "ev" }]);
  });
});

describe("events", () => {
  const html = (json: unknown) => `<html><head><title>Ignored</title><script type="application/ld+json">${JSON.stringify(json)}</script></head><body></body></html>`;
  const lumaLike = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "Organization", name: "Zephyr Labs" },
      {
        "@type": "Event",
        name: "New grad info session",
        startDate: "2026-11-20T17:00:00-05:00",
        endDate: "2026-11-20T17:45:00-05:00",
        eventAttendanceMode: "https://schema.org/OnlineEventAttendanceMode",
        location: { "@type": "VirtualLocation", url: "https://zoom.example/j/1" },
        organizer: { "@type": "Organization", name: "Zephyr Labs" },
        description: "<p>Engineers on what new grads work on in their first year, then questions.</p>",
        offers: { "@type": "Offer", validThrough: "2026-11-19T23:59:00-05:00" },
      },
    ],
  };

  it("reads a pasted link's schema.org Event, then the page's own words", () => {
    expect(readStructuredEvent(html(lumaLike), "https://zephyrlabs.example/events/info")).toEqual({
      title: "New grad info session",
      starts_at: "2026-11-20T22:00:00.000Z",
      ends_at: "2026-11-20T22:45:00.000Z",
      location: "Online",
      online: true,
      url: "https://zephyrlabs.example/events/info",
      signup_closes_at: "2026-11-20T04:59:00.000Z",
      host: "Zephyr Labs",
      about: "Engineers on what new grads work on in their first year, then questions.",
      organizer: "Zephyr Labs",
      source: "structured_data",
    });
    const inPerson = readStructuredEvent(html({ "@type": "EducationEvent", name: "Women in payments night", startDate: "2026-11-21T18:30:00-08:00",
      location: { "@type": "Place", name: "Zephyr HQ", address: { addressLocality: "San Francisco", addressRegion: "CA" } } }), "https://x.example");
    expect(inPerson).toMatchObject({ location: "Zephyr HQ · San Francisco, CA", online: false });
    // A date without a time isn't guessed at.
    expect(readStructuredEvent(html({ "@type": "Event", name: "Fair", startDate: "2026-11-21" }), "https://x.example")?.starts_at).toBeNull();
    expect(readPageBasics('<meta property="og:title" content="Résumé review &amp; chat"><meta name="description" content="One on one.">', "https://x.example"))
      .toMatchObject({ title: "Résumé review & chat", about: "One on one.", starts_at: null, source: "page_title" });
  });

  it("asks Workers AI when the page has no structured event, and keeps only real dates", async () => {
    const calls: unknown[] = [];
    const env = { AI: { run: async (_model: string, input: unknown) => {
      calls.push(input);
      return { response: { title: "Hackathon", organizer: "Zephyr Labs", starts_at: "2026-12-01T09:00:00-05:00", ends_at: "", location: "Zephyr HQ, New York",
        online: false, signup_closes_at: "soon", about: "A day of building." } };
    } } } as unknown as Env;
    const draft = await readEventWithAi(env, "<html><body><h1>Hackathon</h1><p>Dec 1, 9am, Zephyr HQ</p></body></html>", "https://zephyrlabs.example/hack");
    expect(draft).toMatchObject({ title: "Hackathon", starts_at: "2026-12-01T14:00:00.000Z", ends_at: null, signup_closes_at: null, source: "ai" });
    expect(JSON.stringify(calls[0])).toContain("untrusted data");
    expect(await readEventWithAi({} as Env, "<p>x</p>", "https://x.example")).toBeNull();
  });

  it("are added by the admin from a link, shown on the company's page, and reminded the day before", async () => {
    const { sqlite, db, env, guest, signedIn } = await setup();
    expect(await matchEventCompany(db, { url: "https://www.zephyrlabs.example/careers/events", organizer: "" })).toEqual({ id: "zephyr", name: "Zephyr Labs" });
    expect(await matchEventCompany(db, { url: "https://lu.ma/abc", organizer: "Other Co" })).toEqual({ id: "other", name: "Other Co" });

    const admin = await signedIn("owner@pinkslip.work", "admin");
    globalThis.fetch = (async () => new Response(html(lumaLike), { status: 200, headers: { "content-type": "text/html" } })) as unknown as typeof fetch;
    const preview = await (await admin.call("/api/v2/events/preview", { url: "https://zephyrlabs.example/events/info" })).json() as { draft: { title: string }; company: { id: string } };
    expect(preview).toMatchObject({ draft: { title: "New grad info session" }, company: { id: "zephyr" } });
    globalThis.fetch = realFetch;

    const person = await guest();
    expect((await person.call("/api/v2/events", { company_id: "zephyr", title: "x", starts_at: NOW, url: "https://x.example" })).status).toBe(403);
    expect((await admin.call("/api/v2/events", { company_id: "zephyr", title: "", starts_at: NOW, url: "https://x.example" })).status).toBe(400);
    const startsAt = new Date(Date.now() + 3 * 86_400_000).toISOString();
    const created = await admin.call("/api/v2/events", {
      company_id: "zephyr", title: "New grad info session", starts_at: startsAt, url: "https://zephyrlabs.example/events/info",
      location: "Online", online: true, audience: "New grads", points: ["What the first 90 days look like", ""],
    });
    expect(created.status).toBe(201);
    const event = await created.json() as { id: string; points: string[]; reminders: number };
    expect(event).toMatchObject({ points: ["What the first 90 days look like"], reminders: 0 });

    const page = await (await person.call("/api/v2/companies/zephyr/events", undefined, "GET")).json() as { events: Array<{ id: string; reminded: boolean; company_name: string }> };
    expect(page.events).toEqual([expect.objectContaining({ id: event.id, reminded: false, company_name: "Zephyr Labs" })]);
    expect(await (await person.call(`/api/v2/events/${event.id}/reminder`, undefined, "PUT")).json() as { reminded: boolean }).toEqual({ reminded: true });
    expect(await (await person.call(`/api/v2/events/${event.id}`, undefined, "GET")).json()).toMatchObject({ reminded: true });
    expect((await (await admin.call(`/api/v2/events/${event.id}`, { title: "Info session" }, "PATCH")).json() as { title: string; reminders: number }))
      .toMatchObject({ title: "Info session", reminders: 1 });

    // N19 on its own clock: 6 pm the day before, where the person is.
    sqlite.run("UPDATE users SET time_zone = 'America/New_York' WHERE id = ?", [person.userId]);
    sqlite.run("UPDATE company_events SET starts_at = '2026-11-20T22:00:00.000Z' WHERE id = ?", [event.id]);
    expect(await queueDueEventReminders(env, new Date("2026-11-19T22:59:00Z"))).toBe(0);
    expect(await queueDueEventReminders(env, new Date("2026-11-19T23:01:00Z"))).toBe(1);
    expect(await queueDueEventReminders(env, new Date("2026-11-19T23:30:00Z"))).toBe(0);
    expect(sqlite.query("SELECT kind, title, body, url, entity_type FROM notification_log WHERE user_id = ?").all(person.userId)).toEqual([
      { kind: "event_reminder", title: "Zephyr Labs tomorrow at 5:00 PM", body: "Info session", url: `/events/${event.id}`, entity_type: "company_event" },
    ]);

    // It leaves the company's page the day after, in the person's time zone.
    expect(await listCompanyEvents(db, "zephyr", person.userId, new Date("2026-11-21T04:00:00Z"))).toHaveLength(1);
    expect(await listCompanyEvents(db, "zephyr", person.userId, new Date("2026-11-21T05:01:00Z"))).toHaveLength(0);

    expect((await admin.call(`/api/v2/events/${event.id}`, undefined, "DELETE")).status).toBe(204);
    expect(sqlite.query("SELECT COUNT(*) AS count FROM event_reminders").get()).toEqual({ count: 0 });
  });

  it("show in Today's Coming up for a company you follow or an event you asked about", async () => {
    const { sqlite, db, guest } = await setup();
    const follower = await guest();
    const reminded = await guest();
    const stranger = await guest();
    const at = new Date(Date.now() + 2 * 86_400_000).toISOString();
    sqlite.run(`INSERT INTO company_events (id, company_id, title, starts_at, location, url, created_at, updated_at)
      VALUES ('ev1', 'zephyr', 'Info session', ?, 'Online', 'https://zephyrlabs.example/e/1', ?, ?),
             ('ev2', 'other', 'Fair', ?, 'Boston', 'https://otherco.example/e/2', ?, ?)`, [at, NOW, NOW, at, NOW, NOW]);
    sqlite.run("INSERT INTO company_follows (user_id, company_id, followed_at) VALUES (?, 'zephyr', ?)", [follower.userId, NOW]);
    sqlite.run("INSERT INTO event_reminders (user_id, event_id, created_at) VALUES (?, 'ev2', ?)", [reminded.userId, NOW]);
    const comingUp = async (userId: string) => (await buildToday(db, userId)).coming_up
      .flatMap((entry) => entry.kind === "upcoming_event" ? [`${entry.event.id}:${entry.event.reminded}`] : []);
    expect(await comingUp(follower.userId)).toEqual(["ev1:false"]);
    expect(await comingUp(reminded.userId)).toEqual(["ev2:true"]);
    expect(await comingUp(stranger.userId)).toEqual([]);
  });
});
