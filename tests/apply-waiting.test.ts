import type { Database } from "bun:sqlite";
import { afterEach, describe, expect, it } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { buildToday } from "@worker/activity";
import { applyResumeKey } from "@worker/apply/send-files";
import { sendWaiting, SendError } from "@worker/apply/sends";
import {
  dropWaiting, groupQuestions, keepWaitingAnswers, remindWaiting, tellWaiting, waitingPush, waitingRows, waitingView,
} from "@worker/apply/waiting";
import type { Env } from "@worker/types";
import type { SendNeed } from "../shared/auto-apply";
import { sqliteD1 } from "./sqlite-d1";

const migrationsDir = new URL("../migrations/", import.meta.url).pathname;
const databases: Database[] = [];
afterEach(() => { while (databases.length) databases.pop()!.close(); });

const GPA = ["2.4 or below", "3.1 - 3.3 (out of 4.0)", "3.4 - 3.5 (out of 4.0)", "3.6 or above (out of 4.0)"];
const GRADUATION = ["Earlier than Fall 2026", "Spring 2027", "Fall 2027 or later"];
const YES_NO = ["Yes", "No"];

// One run's stops, as a tester's came back (2026-10-29), with made-up forms.
const NEEDS: Record<string, SendNeed[]> = {
  glean: [
    { ref: "g1", label: "What is your GPA?", kind: "text", required: true },
    { ref: "g2", label: "Are you willing to relocate?", kind: "combobox", options: YES_NO, required: true },
  ],
  databricks: [
    { ref: "d1", label: "What is your GPA", kind: "combobox", options: GPA, required: true },
    { ref: "d2", label: "What is your graduation date?", kind: "combobox", options: GRADUATION, required: true },
  ],
  intercom: [
    { ref: "i1", label: "Are you willing to relocate?", kind: "combobox", options: YES_NO, required: true },
    { ref: "i2", label: "Are you willing to work from our office location 3 days per week?", kind: "combobox", options: YES_NO, required: true },
  ],
};

/** 6:14 PM in New York, Nov 4. */
const STOPPED = "2026-11-04T23:14:00.000Z";

function setup() {
  const { sqlite, db } = sqliteD1();
  databases.push(sqlite);
  for (const file of readdirSync(migrationsDir).filter((name) => name.endsWith(".sql")).sort()) {
    sqlite.exec(readFileSync(`${migrationsDir}${file}`, "utf8"));
  }
  sqlite.run("INSERT INTO users (id, time_zone, role) VALUES ('u1', 'America/New_York', 'admin')");
  sqlite.run(`INSERT INTO companies (id, name, ats_type, ats_slug, website) VALUES
    ('t-glean', 'Glean', 'greenhouse', 'test-glean', 'glean.com'),
    ('t-databricks', 'Databricks', 'greenhouse', 'test-databricks', 'databricks.com'),
    ('t-intercom', 'Intercom', 'greenhouse', 'test-intercom', 'intercom.com')`);
  sqlite.run(`INSERT INTO jobs (id, company_id, external_id, title, url, location) VALUES
    ('glean', 't-glean', '1', 'Software Engineer', 'https://job-boards.greenhouse.io/glean/jobs/1', 'Mountain View, CA'),
    ('databricks', 't-databricks', '2', 'Software Engineer, New Grad', 'https://job-boards.greenhouse.io/databricks/jobs/2', 'Bellevue, WA'),
    ('intercom', 't-intercom', '3', 'Product Engineer', 'https://job-boards.greenhouse.io/intercom/jobs/3', 'Chicago, IL')`);
  const stop = (id: string, needs: SendNeed[], extra: { status?: string; dry_run?: number; finished_at?: string; created_at?: string } = {}) => {
    sqlite.query(
      `INSERT INTO apply_sends (id, user_id, job_id, ats, url, dry_run, status, needs_json, created_at, updated_at, finished_at)
       VALUES (?, 'u1', ?, 'greenhouse', 'https://example.com', ?, ?, ?, ?, ?, ?)`
    ).run(`${id}-send`, id, extra.dry_run ?? 0, extra.status ?? "needs_you", JSON.stringify(needs),
      extra.created_at ?? "2026-11-04T23:00:00.000Z", STOPPED, extra.finished_at ?? STOPPED);
  };
  const pushes = () => sqlite.query("SELECT dedupe_key, title, body, url FROM notification_log ORDER BY created_at").all() as Array<Record<string, string>>;
  const created: unknown[] = [];
  const bucket = new Map<string, Uint8Array>();
  bucket.set(applyResumeKey("u1"), new TextEncoder().encode("%PDF-1.7"));
  const env = {
    DB: db,
    BROWSER: {},
    RESUME_BUCKET: { head: async (key: string) => (bucket.has(key) ? { size: 8 } : null) },
    APPLY_SEND: { create: async (options: unknown) => { created.push(options); return {}; } },
  } as unknown as Env;
  return { sqlite, db, env, stop, pushes, created };
}

describe("questions several stopped sends ask", () => {
  it("are asked once: the same question on two forms, and a GPA typed for one form and chosen on another", () => {
    const groups = groupQuestions([
      { id: "glean", company: "Glean", needs: NEEDS.glean! },
      { id: "databricks", company: "Databricks", needs: NEEDS.databricks! },
      { id: "intercom", company: "Intercom", needs: NEEDS.intercom! },
    ]);
    expect(groups.map((group) => [group.members.map((member) => member.need.ref), group.merged.map((member) => member.need.ref)])).toEqual([
      [["g1"], ["d1"]],
      [["g2", "i1"], []],
      [["d2"], []],
      [["i2"], []],
    ]);
  });

  it("stay apart when their choices differ", () => {
    const groups = groupQuestions([
      { id: "a", company: "A", needs: [{ ref: "a1", label: "Pronouns", kind: "combobox", options: ["She/her", "He/him"] }] },
      { id: "b", company: "B", needs: [{ ref: "b1", label: "Pronouns", kind: "combobox", options: ["she/her", "he/him", "they/them"] }] },
    ]);
    expect(groups).toHaveLength(2);
  });
});

describe("the push for stopped sends", () => {
  const view = (sends: number, left: number) => ({
    sends: [
      { id: "g", job_id: "glean", company: "Glean", domain: null, title: "Software Engineer" },
      { id: "d", job_id: "databricks", company: "Databricks", domain: null, title: "" },
      { id: "i", job_id: "intercom", company: "Intercom", domain: null, title: "" },
    ].slice(0, sends),
    questions: Array.from({ length: 4 }, (_, index) => ({ id: `q${index}`, label: "", kind: "text", options: [], companies: [], answer: index < left ? null : "yes" })),
    until: "2026-11-05T23:14:00.000Z",
  });

  it("names the companies and what's left, with no deadline", () => {
    expect(waitingPush(view(3, 4), false)).toEqual({ title: "Glean, Databricks and Intercom", body: "4 questions to finish all 3", url: "/today?answer=sends" });
    expect(waitingPush(view(3, 2), true).body).toBe("Still 2 questions to finish all 3");
    expect(waitingPush(view(1, 2), false)).toEqual({ title: "Glean", body: "2 questions to finish · Software Engineer", url: "/jobs/glean" });
    expect(waitingPush(view(1, 1), true).body).toBe("Still one question to finish · Software Engineer");
  });
});

describe("sends that stopped on questions", () => {
  it("wait together: told once the run is done, on Today as one row, kept answers counting down", async () => {
    const { sqlite, db, env, stop, pushes } = setup();
    stop("glean", NEEDS.glean!);
    stop("databricks", NEEDS.databricks!);
    stop("intercom", NEEDS.intercom!, { status: "running", finished_at: undefined });
    sqlite.run("UPDATE apply_sends SET finished_at = NULL WHERE job_id = 'intercom'");
    const now = new Date(STOPPED);

    // Intercom is still going, so nothing is said yet.
    expect(await tellWaiting(env, "u1", now)).toBe(false);
    sqlite.query("UPDATE apply_sends SET status = 'needs_you', finished_at = ? WHERE job_id = 'intercom'").run(STOPPED);
    expect(await tellWaiting(env, "u1", now)).toBe(true);
    expect(await tellWaiting(env, "u1", now)).toBe(false);
    expect(pushes()).toEqual([{ dedupe_key: "apply:waiting:glean-send", title: "Glean, Databricks and Intercom", body: "4 questions to finish all 3", url: "/today?answer=sends" }]);

    const view = waitingView(await waitingRows(db, "u1", now))!;
    expect(view.until).toBe("2026-11-05T23:14:00.000Z");
    expect(view.questions.map((question) => [question.label, question.companies])).toEqual([
      ["What is your GPA?", ["Glean", "Databricks"]],
      ["Are you willing to relocate?", ["Glean", "Intercom"]],
      ["What is your graduation date?", ["Databricks"]],
      ["Are you willing to work from our office location 3 days per week?", ["Intercom"]],
    ]);

    const relocate = view.questions[1]!.id;
    const kept = await keepWaitingAnswers(db, "u1", { [relocate]: "No" }, now);
    expect(kept!.questions[1]!.answer).toBe("No");
    const answered = sqlite.query("SELECT answered_json FROM apply_sends WHERE job_id = 'intercom'").get() as { answered_json: string };
    expect(JSON.parse(answered.answered_json)).toEqual({ i1: "No" });

    const today = await buildToday(db, "u1", now);
    expect(today.needs_you[0]).toMatchObject({ kind: "sends_waiting", questions: 3, until: "2026-11-05T23:14:00.000Z" });
    expect(today.badge).toBe(1);
  });

  it("leave out dry runs and file questions", async () => {
    const { db, stop } = setup();
    stop("glean", [{ ref: "t", label: "Transcript", kind: "file" }]);
    stop("databricks", NEEDS.databricks!, { dry_run: 1 });
    expect(await waitingRows(db, "u1", new Date(STOPPED))).toEqual([]);
  });

  it("get one reminder at 8 the next morning, then none", async () => {
    const { env, stop, pushes, sqlite } = setup();
    stop("glean", NEEDS.glean!);
    stop("intercom", NEEDS.intercom!);
    await tellWaiting(env, "u1", new Date(STOPPED));
    // 7:59 in New York isn't 8; 8:00 is.
    expect(await remindWaiting(env, new Date("2026-11-05T12:59:00.000Z"))).toBe(0);
    expect(await remindWaiting(env, new Date("2026-11-05T13:00:00.000Z"))).toBe(1);
    expect(await remindWaiting(env, new Date("2026-11-05T13:01:00.000Z"))).toBe(0);
    expect(pushes().at(-1)).toMatchObject({ title: "Glean and Intercom", body: "Still 3 questions to finish all 2" });
    expect(sqlite.query("SELECT COUNT(*) AS count FROM apply_sends WHERE reminded_at IS NOT NULL").get()).toEqual({ count: 2 });
  });

  it("lapse after a day, or when dropped", async () => {
    const { db, stop } = setup();
    stop("glean", NEEDS.glean!);
    expect(await waitingRows(db, "u1", new Date("2026-11-05T23:13:00.000Z"))).toHaveLength(1);
    expect(await waitingRows(db, "u1", new Date("2026-11-05T23:15:00.000Z"))).toHaveLength(0);
    expect(await dropWaiting(db, "u1", new Date(STOPPED))).toBe(1);
    expect(await waitingRows(db, "u1", new Date(STOPPED))).toHaveLength(0);
    expect((await buildToday(db, "u1", new Date(STOPPED))).needs_you).toEqual([]);
  });

  it("send all once every question is answered, the answers saved for every later form", async () => {
    const { db, env, stop, sqlite, created } = setup();
    stop("glean", NEEDS.glean!);
    stop("databricks", NEEDS.databricks!);
    const now = new Date(STOPPED);
    const fetcher = (async () => Response.json({ questions: [] })) as unknown as typeof fetch;
    const notAnswered = await sendWaiting(env, "u1", { fetcher, now }).catch((error: SendError) => error.code);
    expect(notAnswered).toBe("not_answered");

    const view = waitingView(await waitingRows(db, "u1", now))!;
    const [gpa, relocate, graduation] = view.questions.map((question) => question.id);
    await keepWaitingAnswers(db, "u1", { [gpa!]: "3.7", [relocate!]: "No", [graduation!]: "Earlier than Fall 2026" }, now);
    const result = await sendWaiting(env, "u1", { fetcher, now });
    expect(result.failed).toEqual([]);
    expect(result.started.map((send) => send.job_id).sort()).toEqual(["databricks", "glean"]);
    expect(created).toHaveLength(2);
    // The typed GPA is the GPA fact, for Databricks' ranges and every later form.
    expect(sqlite.query("SELECT value_json FROM application_answers WHERE answer_key = 'gpa'").get()).toEqual({ value_json: "\"3.7\"" });
    expect(await waitingRows(db, "u1", now)).toEqual([]);
  });
});
