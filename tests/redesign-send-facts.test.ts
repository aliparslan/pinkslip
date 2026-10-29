import { describe, expect, test } from "bun:test";
import type { ApplySend } from "../shared/auto-apply";
import {
  answerSource, followedSend, needControl, refusal, sendButtonState, splitResume,
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
