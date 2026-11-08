import { describe, expect, test } from "bun:test";
import type { ApplySend } from "../shared/auto-apply";
import {
  answerSource, followedSend, lapsed, liveBar, queueable, liveBarDone, needControl, refusal, sendButtonState, splitResume,
} from "../apps/native/src/features/redesign/send-facts";

const send = (patch: Partial<ApplySend> = {}): ApplySend => ({
  id: "s1",
  job_id: "j1",
  company: "Stripe",
  title: "Software Engineer, New Grad",
  ats: "greenhouse",
  url: "https://job-boards.greenhouse.io/stripe/jobs/1",
  dry_run: false,
  status: "running",
  detail: null,
  needs: [],
  sent: [],
  form_shot: false,
  proof_shot: false,
  confirmation_text: null,
  confirmation_url: null,
  progress: null,
  created_at: "2026-10-24T14:52:00Z",
  finished_at: null,
  ...patch,
});

describe("the job page's send", () => {
  test("follows one that went out over a newer dry run, and otherwise the newest", () => {
    const real = send({ id: "real", status: "unconfirmed" });
    const dry = send({ id: "dry", dry_run: true, status: "ready" });
    expect(followedSend([dry, real], "j1")?.id).toBe("real");
    expect(followedSend([dry, send({ id: "old", status: "failed" })], "j1")?.id).toBe("dry");
    expect(followedSend([send({ job_id: "j2" })], "j1")).toBeNull();
  });

  test("says what the browser is doing, field by field", () => {
    expect(sendButtonState(send({ status: "queued" }), "Stripe")).toEqual({ kind: "opening" });
    expect(sendButtonState(send({ status: "running" }), "Stripe")).toEqual({ kind: "opening" });
    expect(sendButtonState(send({ progress: { filled: 11, of: 17 } }), "Stripe")).toEqual({ kind: "applying", filled: 11, of: 17 });
    expect(sendButtonState(send({ status: "submitting" }), "Stripe")).toEqual({ kind: "sending", company: "Stripe" });
  });

  test("turns pink when the next move is yours", () => {
    expect(sendButtonState(send({ status: "code_needed" }), "Stripe")).toEqual({ kind: "code" });
    expect(sendButtonState(send({ status: "ready", dry_run: true }), "Stripe")).toEqual({ kind: "checked" });
    expect(sendButtonState(send({ status: "blocked" }), "Stripe")).toEqual({ kind: "finishOnPhone" });
    const needs = [{ ref: "q1", label: "Visa?", kind: "radio", options: ["Yes", "No"], required: true }];
    expect(sendButtonState(send({ status: "needs_you", needs }), "Stripe")).toEqual({ kind: "needsYou", questions: 1 });
  });

  test("sends what the app can't answer to the phone, and a broken run to Try again", () => {
    const error = { label: "School is required", kind: "error" };
    expect(sendButtonState(send({ status: "needs_you", needs: [error] }), "Stripe")).toEqual({ kind: "finishOnPhone" });
    expect(sendButtonState(send({ status: "needs_you", needs: [] }), "Stripe")).toEqual({ kind: "didntSend" });
    expect(sendButtonState(send({ status: "failed" }), "Stripe")).toEqual({ kind: "didntSend" });
    expect(sendButtonState(send({ status: "gone" }), "Stripe")).toEqual({ kind: "apply", closed: true });
  });

  test("waits for Stripe when nothing confirmed it, and says Applied when the page did", () => {
    expect(sendButtonState(send({ status: "unconfirmed" }), "Stripe")).toEqual({ kind: "sent", company: "Stripe" });
    expect(sendButtonState(send({ status: "submitted", finished_at: "2026-10-24T14:53:00Z" }), "Stripe")).toEqual({ kind: "applied", date: "Oct 24" });
    expect(sendButtonState(null, "Stripe")).toBeNull();
  });
});

describe("what Pinkslip sent", () => {
  test("labels only the answers the person didn't give", () => {
    expect(answerSource({ by: "pinkslip" }, "greenhouse")).toBeNull();
    expect(answerSource({ by: "jev" }, "greenhouse")).toBe("Guessed from your resume");
    expect(answerSource({ by: "site" }, "ashby")).toBe("Filled by Ashby from your resume");
    expect(answerSource({ by: "page" }, "greenhouse")).toBe("Already on the form");
  });

  test("shows the resume as its file, apart from the answers", () => {
    const { resume, answers } = splitResume([
      { label: "First Name", value: "Jordan", by: "pinkslip" },
      { label: "Resume/CV", value: "Jordan_Lee.pdf", by: "pinkslip" },
    ]);
    expect(resume?.value).toBe("Jordan_Lee.pdf");
    expect(answers.map((answer) => answer.label)).toEqual(["First Name"]);
  });
});

describe("a question a send stopped on", () => {
  test("is a field, a pick, or Yes or No for a statement", () => {
    expect(needControl({ ref: "q", label: "Why us?", kind: "textarea" })).toEqual({ kind: "text", multiline: true });
    expect(needControl({ ref: "q", label: "I agree", kind: "checkbox" })).toEqual({ kind: "pick", options: ["Yes", "No"], multiple: false, search: false });
    expect(needControl({ ref: "q", label: "Pronouns", kind: "checkboxes", options: ["She/her", "He/him"] })).toMatchObject({ kind: "pick", multiple: true });
    const schools = Array.from({ length: 40 }, (_, index) => `School ${index}`);
    expect(needControl({ ref: "q", label: "School", kind: "combobox", options: schools })).toMatchObject({ kind: "pick", search: true });
  });
});

describe("a send that can't start", () => {
  test("says why in a toast, or goes where the fix is", () => {
    expect(refusal("already_sent", "Stripe")).toMatchObject({ message: "Pinkslip already sent this one" });
    expect(refusal("gone", "Stripe")).toMatchObject({ message: "Stripe closed this posting" });
    expect(refusal("limit_reached", "Stripe", { limit: 10 })).toMatchObject({ message: "10 sent today · resets at midnight" });
    expect(refusal("no_resume", "Stripe")).toEqual({ kind: "resume" });
    expect(refusal("sends_unavailable", "Stripe")).toMatchObject({ message: "Couldn't start it", retry: true, error: true });
  });
});

describe("the live bar", () => {
  const at = Date.parse("2026-10-24T15:00:00Z");
  const minutesAgo = (minutes: number) => new Date(at - minutes * 60_000).toISOString();
  const job = (id: string, patch: Partial<ApplySend>) => send({ id, job_id: id, company: id, created_at: minutesAgo(5), ...patch });

  test("follows one application field by field", () => {
    const bar = liveBar([job("Toast", { status: "running", progress: { filled: 11, of: 17 } })], at);
    expect(bar?.state).toEqual({ kind: "sending", company: "Toast", count: "11 of 17", share: 11 / 17 });
  });

  test("counts applications when several are going, and lists the queue", () => {
    const bar = liveBar([
      job("Ramp", { status: "running" }),
      job("Notion", { status: "queued" }),
      job("Stripe", { status: "submitted", finished_at: minutesAgo(2) }),
    ], at);
    expect(bar?.state).toMatchObject({ kind: "sending", company: "Ramp", count: "2 of 3" });
    expect(bar?.queue.next.map((item) => item.company)).toEqual(["Notion"]);
    expect(bar?.queue.sent.map((item) => item.company)).toEqual(["Stripe"]);
  });

  test("puts the job that needs you first, and only the newest send of a job counts", () => {
    const needs = [{ ref: "zip", label: "Postal code", kind: "text" }];
    const answered = [
      job("Toast", { id: "again", status: "running" }),
      job("Toast", { id: "first", status: "needs_you", needs, finished_at: minutesAgo(1), created_at: minutesAgo(3) }),
    ];
    expect(liveBar(answered, at)?.state).toMatchObject({ kind: "sending", company: "Toast" });
    expect(liveBar([job("Toast", { status: "needs_you", needs, finished_at: minutesAgo(1) })], at)?.state)
      .toEqual({ kind: "needs", company: "Toast", words: "Toast needs 1 answer", action: "Answer" });
    expect(liveBar([job("Toast", { status: "code_needed" })], at)?.state).toMatchObject({ words: "Toast needs Greenhouse's code", action: "Enter" });
  });

  test("says it's checking once every field is filled, then sending", () => {
    expect(liveBar([job("Toast", { status: "running", progress: { filled: 15, of: 15 } })], at)?.state).toMatchObject({ count: "Checking" });
    expect(liveBar([job("Toast", { status: "submitting", progress: { filled: 15, of: 15 } })], at)?.state).toMatchObject({ count: "Sending", share: 1 });
  });

  test("asks once for several stops' answers, and says what's still applying", () => {
    const one = [{ ref: "q", label: "Q", kind: "text" }];
    const three = [...one, { ref: "r", label: "R", kind: "text" }, { ref: "s", label: "S", kind: "text" }];
    const bar = liveBar([
      job("Reddit", { status: "needs_you", needs: one, finished_at: minutesAgo(2) }),
      job("Stripe", { status: "needs_you", needs: three, finished_at: minutesAgo(1) }),
      job("Ramp", { status: "running" }),
    ], at);
    expect(bar?.state).toEqual({ kind: "needs", company: "", words: "2 jobs need answers", action: "Answer", group: true, detail: "1 applying" });
    expect(liveBar([job("Reddit", { status: "needs_you", needs: one, finished_at: minutesAgo(2) }), job("Ramp", { status: "running" })], at)?.state)
      .toMatchObject({ words: "Reddit needs 1 answer", detail: "1 applying" });
  });

  test("lets go of a stop you finished yourself, or stopped", () => {
    const blocked = job("Render", { status: "blocked", finished_at: minutesAgo(2) });
    expect(liveBar([blocked], at)?.state).toMatchObject({ words: "Render needs you", action: "Finish" });
    expect(liveBar([blocked], at, new Set(["Render"]))).toBeNull();
    expect(liveBar([{ ...blocked, stopped: true }], at)).toBeNull();
    expect(sendButtonState({ ...blocked, stopped: true }, "Render", at)).toBeNull();
  });

  test("leaves Check first's runs and old stops to the job page and Today", () => {
    expect(liveBar([job("Toast", { status: "running", dry_run: true })], at)).toBeNull();
    expect(liveBar([job("Toast", { status: "needs_you", needs: [{ ref: "q", label: "Q", kind: "text" }], finished_at: minutesAgo(30) })], at)).toBeNull();
  });

  test("says how many went, and how many were confirmed", () => {
    expect(liveBarDone([job("Toast", { status: "submitted" })])).toEqual({ words: "Sent to Toast", detail: "Confirmed" });
    expect(liveBarDone([job("A", { status: "submitted" }), job("B", { status: "unconfirmed" })])).toEqual({ words: "2 sent", detail: "1 confirmed so far" });
    expect(liveBarDone([])).toBeNull();
  });
});

describe("a stopped send that no longer waits", () => {
  const needs = [{ ref: "q1", label: "Visa?", kind: "radio", options: ["Yes", "No"], required: true }];
  const at = Date.parse("2026-11-05T12:00:00Z");

  test("goes back to Apply for me once its day is up or it's dropped", () => {
    const waiting = send({ status: "needs_you", needs, waiting_until: "2026-11-05T23:14:00Z" });
    expect(sendButtonState(waiting, "Stripe", at)).toEqual({ kind: "needsYou", questions: 1 });
    expect(sendButtonState({ ...waiting, waiting_until: "2026-11-05T11:00:00Z" }, "Stripe", at)).toBeNull();
    expect(sendButtonState({ ...waiting, waiting_until: null }, "Stripe", at)).toBeNull();
  });

  test("still waits on a server that doesn't say, and a dry run always does", () => {
    expect(lapsed(send({ status: "needs_you", needs }), at)).toBe(false);
    expect(lapsed(send({ status: "needs_you", needs, dry_run: true, waiting_until: null }), at)).toBe(false);
  });
});

describe("queueing a send from a job row", () => {
  test("is for an open Greenhouse or Ashby job not applied to yet", () => {
    expect(queueable({ source_type: "greenhouse", closed_at: null, applied: false })).toBe(true);
    expect(queueable({ source_type: "ashby" })).toBe(true);
    expect(queueable({ source_type: "lever" })).toBe(false);
    expect(queueable({ source_type: "greenhouse", applied: true })).toBe(false);
    expect(queueable({ source_type: "greenhouse", closed_at: "2026-11-01T00:00:00Z" })).toBe(false);
  });
});
