import { describe, expect, it } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { buildApnsBody } from "../worker/apns";
import { answerAsk, askForStrongMatches, askTime, isStrongMatch, loadAutoApplySettings, saveAutoApplySettings, type AskDeps } from "../worker/apply/asks";
import { concludeAskCheck } from "../worker/apply/ask-checks";
import { SendError } from "../worker/apply/sends";
import { classifyJob } from "../worker/job-features";
import { deliverDueNotifications } from "../worker/notifications";
import { normalizeSearchProfile, SEARCH_PROFILE_VERSION } from "../shared/search-profile";
import type { ApplySend, ApplySendStatus, SendNeed } from "../shared/auto-apply";
import type { JobListing } from "../worker/adapters/types";
import type { Env } from "../worker/types";
import { sqliteD1 } from "./sqlite-d1";

// Every person, company and job here is made up.

const migrationsDir = new URL("../migrations/", import.meta.url).pathname;
// A Tuesday, 3pm in Chicago.
const NOW = new Date("2026-10-27T20:00:00Z");
const PROFILE = { version: SEARCH_PROFILE_VERSION, target_levels: ["new_grad", "early_career"], roles: ["software_engineering"] };

const listing = (title: string, extra: Partial<JobListing> = {}): JobListing => ({
  externalId: title,
  title,
  url: "https://job-boards.greenhouse.io/acme/jobs/1",
  location: "Austin, TX",
  department: "Engineering",
  postedAt: NOW.toISOString(),
  description: "Join us as a new graduate software engineer building our product. Bachelor's degree in Computer Science.",
  salary: null,
  ...extra,
});

function setup(overrides: Partial<Env> = {}) {
  const { sqlite, db } = sqliteD1();
  for (const file of readdirSync(migrationsDir).filter((name) => name.endsWith(".sql")).sort()) {
    sqlite.exec(readFileSync(`${migrationsDir}${file}`, "utf8"));
  }
  sqlite.run("UPDATE companies SET enabled = 0");
  sqlite.run(`INSERT INTO companies (id, name, ats_type, ats_slug, website, enabled) VALUES
    ('acme', 'Acme Test', 'greenhouse', 'acme-test', 'https://acme.example', 1),
    ('globex', 'Globex Test', 'lever', 'globex-test', 'https://globex.example', 1)`);
  const job = (id: string, company: string, title: string, extra: { evergreen?: number } = {}) => sqlite.run(
    `INSERT INTO jobs (id, company_id, external_id, title, url, location, description, posted_at, first_seen_at, evergreen)
     VALUES (?, ?, ?, ?, '', 'Austin, TX', 'x', ?, ?, ?)`,
    [id, company, id, title, NOW.toISOString(), NOW.toISOString(), extra.evergreen ?? 0],
  );
  job("j1", "acme", "Software Engineer, New Grad");
  job("j2", "globex", "Software Engineer, New Grad");
  job("j3", "acme", "Software Engineer, New Grad", { evergreen: 1 });
  const person = (id: string, fields: { role?: string; signedIn?: boolean; device?: boolean; zone?: string } = {}) => {
    sqlite.run("INSERT INTO users (id, name, role, time_zone) VALUES (?, ?, ?, ?)", [id, id, fields.role ?? "user", fields.zone ?? "America/Chicago"]);
    sqlite.run("INSERT INTO user_search_profiles (user_id, profile_json, notifications_enabled) VALUES (?, ?, 1)", [id, JSON.stringify(PROFILE)]);
    if (fields.signedIn !== false) {
      sqlite.run("INSERT INTO auth_identities (id, user_id, provider, provider_subject) VALUES (?, ?, 'email', ?)", [`${id}-identity`, id, `${id}@example.com`]);
    }
    if (fields.device !== false) {
      sqlite.run("INSERT INTO push_subscriptions (id, endpoint, p256dh, auth, user_id, platform) VALUES (?, ?, '', '', ?, 'ios')", [`${id}-device`, `apns:${id}`, id]);
    }
  };
  person("owner", { role: "admin" });
  const env = {
    DB: db,
    AUTO_APPLY_SEND: "admin",
    APPLY_SEND: {},
    ...overrides,
  } as unknown as Env;
  return { sqlite, db, env, person };
}

const jobs = [
  { jobId: "j1", listing: listing("Software Engineer, New Grad") },
  { jobId: "j2", listing: listing("Software Engineer, New Grad") },
  { jobId: "j3", listing: listing("Software Engineer, New Grad") },
];

/** Starts sends without a browser, recording what it was asked; a check is a dry run. */
function fakeQueue(queued: string[] = [], refuse?: SendError): AskDeps {
  return {
    queue: async (_env, userId, input) => {
      if (refuse) throw refuse;
      queued.push(`${userId}:${input.jobId}${input.dryRun && input.forAsk ? ":check" : ""}`);
      return { id: input.sendId ?? `send-${input.jobId}`, job_id: input.jobId, status: "queued" } as unknown as ApplySend;
    },
  };
}

/** The check's dry run ends (sends.ts calls this from finish). */
const checked = (env: Env, jobId: string, status: ApplySendStatus = "ready", needs: SendNeed[] = [], at = NOW, userId = "owner") =>
  concludeAskCheck(env, { user_id: userId, job_id: jobId }, status, needs, at);

describe("strong matches", () => {
  const profile = normalizeSearchProfile(PROFILE);
  const features = classifyJob(listing("Software Engineer, New Grad"));
  const base = { jobId: "j1", listing: listing("Software Engineer, New Grad"), features, profile, evergreen: false, atsType: "greenhouse" };

  it("asks only about a role the person picked, on a form Pinkslip can send", () => {
    expect(isStrongMatch(base)).toBe(true);
    expect(isStrongMatch({ ...base, atsType: "lever" })).toBe(false);
    expect(isStrongMatch({ ...base, evergreen: true })).toBe(false);
    // Posted 30 or more days ago, even when it isn't marked as kept.
    const aged = { ...base.listing, postedAt: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString() };
    expect(isStrongMatch({ ...base, listing: aged })).toBe(false);
    // Outside the search entirely.
    const senior = listing("Staff Software Engineer", { description: "10+ years of experience required." });
    expect(isStrongMatch({ ...base, listing: senior, features: classifyJob(senior) })).toBe(false);
  });

  it("holds an ask found at night until 8am", () => {
    expect(askTime(NOW, "America/Chicago")).toEqual(NOW);
    expect(askTime(new Date("2026-10-28T04:30:00Z"), "America/Chicago").toISOString()).toBe("2026-10-28T13:00:00.000Z");
    expect(askTime(new Date("2026-10-28T10:00:00Z"), "America/Chicago").toISOString()).toBe("2026-10-28T13:00:00.000Z");
  });
});

describe("asking as strong matches post", () => {
  it("checks the form, then asks once with a push in place of the new-job alert", async () => {
    const { db, env, sqlite } = setup();
    sqlite.run("INSERT INTO notification_candidates (id, user_id, job_id, channel, status, created_at) VALUES ('c1', 'owner', 'j1', 'push', 'pending', ?)", [NOW.toISOString()]);
    const queued: string[] = [];
    expect(await askForStrongMatches(env, jobs, NOW, fakeQueue(queued))).toBe(1);
    expect(queued).toEqual(["owner:j1:check"]);
    // While the form is checked: no push yet, and the alert waits.
    expect(sqlite.query("SELECT status FROM apply_asks").all()).toEqual([{ status: "checking" }]);
    expect(sqlite.query("SELECT COUNT(*) AS n FROM notification_log").get()).toEqual({ n: 0 });
    expect(sqlite.query("SELECT status FROM notification_candidates WHERE id = 'c1'").get()).toEqual({ status: "skipped" });
    await checked(env, "j1");
    expect(sqlite.query("SELECT job_id, status, notify_at FROM apply_asks").all()).toEqual([
      { job_id: "j1", status: "asked", notify_at: NOW.toISOString() },
    ]);
    expect(sqlite.query("SELECT kind, title, body, url, entity_id, scheduled_for FROM notification_log").all()).toEqual([{
      kind: "apply_ask", title: "Acme Test", body: "Software Engineer, New Grad\nHold to apply", url: "/jobs/j1", entity_id: "j1",
      scheduled_for: NOW.toISOString(),
    }]);
    expect(sqlite.query("SELECT status FROM notification_candidates WHERE id = 'c1'").get()).toEqual({ status: "skipped" });
    // Never twice.
    expect(await askForStrongMatches(env, jobs, NOW, fakeQueue())).toBe(0);
    expect((await db.prepare("SELECT COUNT(*) AS n FROM notification_log").first<{ n: number }>())?.n).toBe(1);
  });

  it("asks only people with sends open, auto-apply on and not paused", async () => {
    const { env, sqlite, person } = setup();
    person("tester");
    sqlite.run("INSERT INTO feature_grants (user_id, flag, created_at) VALUES ('tester', 'AUTO_APPLY_SEND', ?)", [NOW.toISOString()]);
    person("stranger");
    person("guest", { role: "admin", signedIn: false });
    person("quiet", { role: "admin" });
    await saveAutoApplySettings(env, "quiet", { mode: "off" }, NOW);
    person("away", { role: "admin" });
    await saveAutoApplySettings(env, "away", { pause: "week" }, NOW);
    await askForStrongMatches(env, jobs, NOW, fakeQueue());
    expect(sqlite.query("SELECT user_id FROM apply_asks ORDER BY user_id").all()).toEqual([{ user_id: "owner" }, { user_id: "tester" }]);
    // With sends off, nothing.
    const off = setup({ AUTO_APPLY_SEND: "off" });
    expect(await askForStrongMatches(off.env, jobs, NOW, fakeQueue())).toBe(0);
  });

  it("leaves applied jobs, hidden companies and a used-up plan to the normal alert", async () => {
    const { env, sqlite } = setup();
    sqlite.run(`INSERT INTO applications (id, user_id, job_id, company_name, title, stage, stage_changed_at, created_at, updated_at)
      VALUES ('a1', 'owner', 'j1', 'Acme Test', 'Software Engineer, New Grad', 'applied', ?, ?, ?)`, [NOW.toISOString(), NOW.toISOString(), NOW.toISOString()]);
    expect(await askForStrongMatches(env, jobs, NOW, fakeQueue())).toBe(0);
    sqlite.run("DELETE FROM applications");
    sqlite.run("INSERT INTO user_blocked_companies (user_id, company_id) VALUES ('owner', 'acme')");
    expect(await askForStrongMatches(env, jobs, NOW, fakeQueue())).toBe(0);
    sqlite.run("DELETE FROM user_blocked_companies");
    // Free's three sends a week, all used.
    for (const id of ["l1", "l2", "l3"]) {
      sqlite.run("INSERT INTO usage_ledger (id, user_id, kind, ref_id, created_at) VALUES (?, 'owner', 'auto_apply_send', NULL, ?)", [id, NOW.toISOString()]);
    }
    expect(await askForStrongMatches(env, jobs, NOW, fakeQueue())).toBe(0);
  });

  it("holds a night-time ask for the morning", async () => {
    const { env, sqlite } = setup();
    const night = new Date("2026-10-28T04:30:00Z");
    await askForStrongMatches(env, jobs, night, fakeQueue());
    await checked(env, "j1", "ready", [], night);
    expect(sqlite.query("SELECT scheduled_for FROM notification_log").get()).toEqual({ scheduled_for: "2026-10-28T13:00:00.000Z" });
  });
});

describe("the check before an ask", () => {
  const pending = (sqlite: ReturnType<typeof setup>["sqlite"]) =>
    sqlite.run("INSERT INTO notification_candidates (id, user_id, job_id, channel, status, created_at) VALUES ('c1', 'owner', 'j1', 'push', 'pending', ?)", [NOW.toISOString()]);

  it("asks about a form that stopped only on questions the person can answer", async () => {
    const { env, sqlite } = setup();
    await askForStrongMatches(env, jobs, NOW, fakeQueue());
    await checked(env, "j1", "needs_you", [{ label: "Why Acme?", kind: "textarea" }]);
    expect(sqlite.query("SELECT status FROM apply_asks").get()).toEqual({ status: "asked" });
    expect(sqlite.query("SELECT COUNT(*) AS n FROM notification_log").get()).toEqual({ n: 1 });
  });

  it("never asks about a form Pinkslip couldn't fill, and the alert goes out instead", async () => {
    for (const [status, needs] of [
      ["needs_you", [{ label: "Country", kind: "error" }]],
      ["needs_you", [{ label: "Resume", kind: "file" }]],
      ["blocked", []],
      ["gone", []],
      ["failed", []],
    ] as [ApplySendStatus, SendNeed[]][]) {
      const { env, sqlite } = setup();
      pending(sqlite);
      await askForStrongMatches(env, jobs, NOW, fakeQueue());
      await checked(env, "j1", status, needs);
      expect(sqlite.query("SELECT status FROM apply_asks").get()).toEqual({ status: "skipped" });
      expect(sqlite.query("SELECT COUNT(*) AS n FROM notification_log").get()).toEqual({ n: 0 });
      expect(sqlite.query("SELECT status, last_error FROM notification_candidates WHERE id = 'c1'").get()).toEqual({ status: "pending", last_error: null });
      await expect(answerAsk(env, "owner", "j1", "apply", NOW, fakeQueue())).rejects.toMatchObject({ code: "not_found" });
    }
  });

  it("leaves a check that couldn't start to the normal alert", async () => {
    const { env, sqlite } = setup();
    pending(sqlite);
    expect(await askForStrongMatches(env, jobs, NOW, fakeQueue([], new SendError("Upload the resume for sends first.", 409, "no_resume")))).toBe(0);
    expect(sqlite.query("SELECT status FROM apply_asks").get()).toEqual({ status: "skipped" });
    expect(sqlite.query("SELECT status FROM notification_candidates WHERE id = 'c1'").get()).toEqual({ status: "pending" });
  });

  it("doesn't ask once the person paused or applied while it checked", async () => {
    const { env, sqlite } = setup();
    await askForStrongMatches(env, jobs, NOW, fakeQueue());
    await saveAutoApplySettings(env, "owner", { pause: "day" }, NOW);
    await checked(env, "j1");
    expect(sqlite.query("SELECT status FROM apply_asks").get()).toEqual({ status: "skipped" });
    expect(sqlite.query("SELECT COUNT(*) AS n FROM notification_log").get()).toEqual({ n: 0 });
  });

  it("asks at most five a day, about the freshest postings", async () => {
    const { env, sqlite } = setup();
    const many = Array.from({ length: 7 }, (_, index) => {
      const id = `n${index}`;
      // n6 is the newest; n0 the oldest.
      const posted = new Date(NOW.getTime() - (7 - index) * 60_000).toISOString();
      sqlite.run(`INSERT INTO jobs (id, company_id, external_id, title, url, location, description, posted_at, first_seen_at, evergreen)
        VALUES (?, 'acme', ?, 'Software Engineer, New Grad', '', 'Austin, TX', 'x', ?, ?, 0)`, [id, id, posted, posted]);
      return { jobId: id, listing: listing("Software Engineer, New Grad", { externalId: id, postedAt: posted }) };
    });
    const queued: string[] = [];
    expect(await askForStrongMatches(env, many, NOW, fakeQueue(queued))).toBe(5);
    expect(queued).toEqual(["n6", "n5", "n4", "n3", "n2"].map((id) => `owner:${id}:check`));
    // A check that didn't ask frees its place.
    await checked(env, "n6", "blocked");
    expect(await askForStrongMatches(env, many, NOW, fakeQueue(queued))).toBe(1);
    expect(queued.at(-1)).toBe("owner:n1:check");
    // The next day starts over.
    const tomorrow = new Date(NOW.getTime() + 24 * 60 * 60 * 1000);
    expect(await askForStrongMatches(env, many, tomorrow, fakeQueue(queued))).toBe(1);
    expect(queued.at(-1)).toBe("owner:n0:check");
  });
});

describe("Apply for me", () => {
  it("sends a Pro person's strong match with no ask, and asks on Free", async () => {
    const { env, sqlite } = setup();
    sqlite.run("INSERT INTO user_plans (user_id, plan, source, started_at, updated_at) VALUES ('owner', 'pro', 'admin', ?, ?)", [NOW.toISOString(), NOW.toISOString()]);
    await saveAutoApplySettings(env, "owner", { mode: "auto" }, NOW);
    const queued: string[] = [];
    expect(await askForStrongMatches(env, jobs, NOW, fakeQueue(queued))).toBe(1);
    expect(queued).toEqual(["owner:j1"]);
    expect(sqlite.query("SELECT status, send_id FROM apply_asks").all()).toEqual([{ status: "sent", send_id: "send-j1" }]);
    expect(sqlite.query("SELECT COUNT(*) AS n FROM notification_log").get()).toEqual({ n: 0 });
  });

  it("is Pro", async () => {
    const { env } = setup();
    await expect(saveAutoApplySettings(env, "owner", { mode: "auto" }, NOW)).rejects.toMatchObject({ code: "pro_only" });
    expect(await loadAutoApplySettings(env, "owner", NOW)).toEqual({ mode: "ask", paused_until: null, paused_indefinitely: false, can_automate: false });
  });

  it("leaves a refused send to the normal alert", async () => {
    const { env, sqlite } = setup();
    sqlite.run("INSERT INTO user_plans (user_id, plan, source, started_at, updated_at) VALUES ('owner', 'pro', 'admin', ?, ?)", [NOW.toISOString(), NOW.toISOString()]);
    await saveAutoApplySettings(env, "owner", { mode: "auto" }, NOW);
    expect(await askForStrongMatches(env, jobs, NOW, fakeQueue([], new SendError("Upload the resume for sends first.", 409, "no_resume")))).toBe(0);
    expect(sqlite.query("SELECT COUNT(*) AS n FROM apply_asks").get()).toEqual({ n: 0 });
  });
});

describe("Pause", () => {
  it("lasts a day, a week or until turned back on, and stops automatic sends that haven't started", async () => {
    const { env, sqlite } = setup();
    expect((await saveAutoApplySettings(env, "owner", { pause: "day" }, NOW)).paused_until).toBe("2026-10-28T20:00:00.000Z");
    expect(await saveAutoApplySettings(env, "owner", { pause: "until_resumed" }, NOW)).toMatchObject({ paused_indefinitely: true });
    expect((await saveAutoApplySettings(env, "owner", { pause: null }, NOW)).paused_until).toBeNull();

    sqlite.run("INSERT INTO usage_ledger (id, user_id, kind, ref_id, created_at) VALUES ('ledger', 'owner', 'auto_apply_send', 's1', ?)", [NOW.toISOString()]);
    sqlite.run(`INSERT INTO apply_sends (id, user_id, job_id, ats, url, status, dry_run, ledger_id, created_at, updated_at)
      VALUES ('s1', 'owner', 'j1', 'greenhouse', 'https://job-boards.greenhouse.io/acme/jobs/1', 'queued', 0, 'ledger', ?, ?)`, [NOW.toISOString(), NOW.toISOString()]);
    sqlite.run("INSERT INTO apply_asks (id, user_id, job_id, status, send_id, created_at) VALUES ('k1', 'owner', 'j1', 'sent', 's1', ?)", [NOW.toISOString()]);
    await saveAutoApplySettings(env, "owner", { pause: "week" }, NOW);
    expect(sqlite.query("SELECT status, detail FROM apply_sends WHERE id = 's1'").get()).toEqual({ status: "failed", detail: "Paused before it started. Nothing was sent." });
    expect(sqlite.query("SELECT released_at IS NOT NULL AS released FROM usage_ledger WHERE id = 'ledger'").get()).toEqual({ released: 1 });
  });
});

describe("the push's buttons", () => {
  it("Apply starts the send and Not this one dismisses the job", async () => {
    const { env, sqlite } = setup();
    await askForStrongMatches(env, jobs, NOW, fakeQueue());
    // Nothing to answer while the form is checked.
    await expect(answerAsk(env, "owner", "j1", "apply", NOW, fakeQueue())).rejects.toMatchObject({ code: "not_found" });
    await checked(env, "j1");
    const queued: string[] = [];
    expect(await answerAsk(env, "owner", "j1", "apply", NOW, fakeQueue(queued))).toMatchObject({ status: "applied", send: { id: "send-j1" } });
    expect(queued).toEqual(["owner:j1"]);
    expect(sqlite.query("SELECT status, send_id FROM apply_asks").get()).toEqual({ status: "applied", send_id: "send-j1" });

    sqlite.run("UPDATE apply_asks SET status = 'asked', send_id = NULL");
    expect(await answerAsk(env, "owner", "j1", "dismiss", NOW, fakeQueue())).toEqual({ status: "dismissed", send: null });
    await expect(answerAsk(env, "owner", "j2", "dismiss", NOW, fakeQueue())).rejects.toMatchObject({ code: "not_found" });
  });

  it("go out on a push that names its category and job", async () => {
    const { env } = setup();
    await askForStrongMatches(env, jobs, NOW, fakeQueue());
    await checked(env, "j1");
    const sent: unknown[] = [];
    const stats = await deliverDueNotifications(env, NOW, async (_subscription, payload) => {
      sent.push(payload);
      return { ok: true, status: 200 };
    });
    expect(stats.sent).toBe(1);
    expect(sent[0]).toMatchObject({ category: "apply_ask", kind: "apply_ask", data: { url: "/jobs/j1", job_ids: ["j1"] } });
    const body = JSON.parse(buildApnsBody(sent[0] as Parameters<typeof buildApnsBody>[0]));
    expect(body.aps.category).toBe("apply_ask");
  });
});
