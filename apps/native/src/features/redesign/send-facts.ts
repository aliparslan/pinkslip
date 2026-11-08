import type { ApplySend, SendNeed, SentAnswer } from "@pinkslip/core/api";
import type { IconName } from "@pinkslip/domain/icons";
import type { ApplyState } from "../../ui/apply-state";

/**
 * Auto-apply's sends on the job page (Paper "Send screens · the missing
 * states · Oct 24", building on "1 · The Apply button, every state"): the job
 * page is the send page, so one send becomes one button state, and every
 * push opens the job.
 */

/** The forms Pinkslip's own browser sends. Everything else is plain Apply. */
export const SENDABLE = new Set(["greenhouse", "ashby"]);

const WENT_OUT = new Set<ApplySend["status"]>(["submitted", "unconfirmed"]);

/** The send a job page follows: one that went out, or else the newest. The
 * list comes newest first. */
export function followedSend(sends: readonly ApplySend[] | undefined, jobId: string): ApplySend | null {
  const mine = (sends ?? []).filter((send) => send.job_id === jobId);
  return mine.find((send) => !send.dry_run && WENT_OUT.has(send.status)) ?? mine[0] ?? null;
}

/** Where a send can still be stopped: filling, or waiting on the person.
 * Not once it's pressing Submit. */
export function stoppable(send: ApplySend | null): boolean {
  return Boolean(send && !send.stopped && ["queued", "running", "code_needed", "needs_you", "blocked", "ready"].includes(send.status));
}

/** A job a long press can queue a send for (owner, 2026-11-04): a
 * Greenhouse or Ashby form that's still open, not applied to yet. */
export function queueable(job: { source_type?: string | null; closed_at?: string | null; applied?: boolean | number | null }): boolean {
  return !job.applied && !job.closed_at && SENDABLE.has(job.source_type ?? "");
}

/** A question the app can ask and send back: it has a ref, and it isn't the
 * form's own error message or a file to upload. */
export const canAnswer = (need: SendNeed) => Boolean(need.ref) && need.kind !== "error" && need.kind !== "file";

/** A real stop that no longer waits: dropped (Don't send), or its day is up
 * (owner, 2026-11-04). Servers before migration 0110 don't say, and their
 * stops still wait. */
export function lapsed(send: ApplySend, now = Date.now()): boolean {
  if (send.stopped && send.status === "needs_you") return true;
  if (send.dry_run || send.status !== "needs_you" || send.waiting_until === undefined) return false;
  return send.waiting_until === null || Date.parse(send.waiting_until) <= now;
}

const monthDay = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });

/** The button for where a send stands; null to leave the page's own. */
export function sendButtonState(send: ApplySend | null, company: string, now = Date.now()): ApplyState | null {
  // Stopped, the job is back to Apply for me.
  if (!send || send.stopped || lapsed(send, now)) return null;
  switch (send.status) {
    case "queued": return { kind: "opening" };
    case "running": return send.progress ? { kind: "applying", filled: send.progress.filled, of: send.progress.of } : { kind: "opening" };
    case "submitting": return { kind: "sending", company };
    case "code_needed": return { kind: "code" };
    case "submitted": return { kind: "applied", date: monthDay(send.finished_at ?? send.created_at) };
    case "unconfirmed": return { kind: "sent", company };
    case "ready": return { kind: "checked" };
    case "needs_you": {
      // Something the app can't answer (the form's own error, a file) is
      // finished in assisted apply; nothing at all means the run broke.
      if (send.needs.length === 0) return { kind: "didntSend" };
      return send.needs.every(canAnswer) ? { kind: "needsYou", questions: send.needs.length } : { kind: "finishOnPhone" };
    }
    case "blocked": return { kind: "finishOnPhone" };
    case "gone": return { kind: "apply", closed: true };
    case "failed": return { kind: "didntSend" };
  }
}

/** Where an answer on the form came from. Only answers the person didn't
 * give carry a line (Paper S6). */
export function answerSource(answer: Pick<SentAnswer, "by">, ats: ApplySend["ats"]): string | null {
  switch (answer.by) {
    case "pinkslip": return null;
    case "jev": return "Guessed from your resume";
    case "site": return `Filled by ${atsName(ats)} from your resume`;
    case "page": return "Already on the form";
  }
}

export const atsName = (ats: ApplySend["ats"]) => (ats === "greenhouse" ? "Greenhouse" : "Ashby");

/** The resume's file, which "What Pinkslip sent" shows as a file row rather
 * than an answer. */
export function splitResume(sent: readonly SentAnswer[]): { resume: SentAnswer | null; answers: SentAnswer[] } {
  const resume = sent.find((answer) => /\.pdf$/i.test(answer.value) && /resume|\bcv\b/i.test(answer.label)) ?? null;
  return { resume, answers: sent.filter((answer) => answer !== resume) };
}

/** What a refusal to start does (Paper S7): a toast, or a way somewhere else. */
export type Refusal =
  | { kind: "toast"; message: string; icon?: IconName; error?: boolean; retry?: boolean }
  | { kind: "resume" };

/** The refusals the button can still meet. Most never show: the button only
 * offers what can happen. */
export function refusal(code: string | undefined, company: string, data?: { limit?: number; resets_at?: string }): Refusal {
  switch (code) {
    case "already_sent": return { kind: "toast", message: "Pinkslip already sent this one", icon: "autoApply" };
    case "already_applied": return { kind: "toast", message: "You've applied to this one", icon: "done" };
    case "gone": return { kind: "toast", message: `${company} closed this posting`, icon: "postingClosed" };
    case "no_resume": return { kind: "resume" };
    case "limit_reached": {
      // Pro's ten are a day's; Free's three a week's, which the Get Pro sheet
      // takes over once it's built.
      const limit = data?.limit ?? 0;
      if (limit >= 10) return { kind: "toast", message: `${limit} sent today · resets at midnight`, icon: "waiting" };
      const day = data?.resets_at ? new Date(data.resets_at).toLocaleDateString("en-US", { weekday: "long" }) : null;
      return { kind: "toast", message: day ? `No sends left · resets ${day}` : "No sends left this week", icon: "waiting" };
    }
    default: return { kind: "toast", message: "Couldn't start it", error: true, retry: true };
  }
}

/** The questions a stopped send asks, in the order the form had them. */
export const askedNeeds = (send: Pick<ApplySend, "needs">) => send.needs.filter(canAnswer);

/** Many options: a search field over them rather than a long list. */
export const LONG_LIST = 12;

/** What a question asks for. Free text is a field; a statement to tick is
 * Yes or No; everything else picks from its options. */
export function needControl(need: SendNeed): { kind: "text"; multiline: boolean } | { kind: "pick"; options: string[]; multiple: boolean; search: boolean } {
  if (need.kind === "checkbox") return { kind: "pick", options: ["Yes", "No"], multiple: false, search: false };
  const options = need.options ?? [];
  if (options.length === 0) return { kind: "text", multiline: need.kind === "textarea" };
  return { kind: "pick", options, multiple: need.kind === "checkboxes", search: options.length > LONG_LIST };
}

/** The live bar's run (Paper "4 · While it runs"): real sends from the last
 * few hours, only the newest of each job, that are going, waiting on the
 * person, or ended in the last minutes. Check first's runs aren't in it. */
const RUN_WINDOW_MS = 6 * 60 * 60_000;
/** A send that stopped on the person stays on the bar this long; after
 * that it waits in Today. */
const WAITS_ON_BAR_MS = 15 * 60_000;

const GOING = new Set<ApplySend["status"]>(["queued", "running", "submitting"]);

export interface LiveBarFacts {
  /** What the bar says; null when there's nothing to show. */
  state: LiveBarState;
  queue: { now: ApplySend | null; next: ApplySend[]; sent: ApplySend[] };
  /** The job the bar's action or tap opens. */
  jobId: string | null;
}

export type LiveBarState =
  | { kind: "sending"; company: string; count: string; share: number }
  /** One job waits on you, or (`group`) several wait on answers the one
   * sheet in Today takes. `detail` says how many are still applying. */
  | { kind: "needs"; company: string; words: string; action: string; detail?: string; group?: boolean };

/** A stop that waits on the person until they act. */
const WAITS = new Set<ApplySend["status"]>(["needs_you", "blocked", "code_needed"]);

/**
 * `applied` holds the jobs marked applied: a stop on one of them waits on
 * nothing, since the person finished it themselves (owner, 2026-11-08: after
 * Finish and "Did you apply? Yes", the bar stayed).
 */
export function liveBar(sends: readonly ApplySend[] | undefined, now = Date.now(), applied: ReadonlySet<string> = new Set()): LiveBarFacts | null {
  const newest = new Map<string, ApplySend>();
  for (const send of sends ?? []) {
    if (send.dry_run || now - Date.parse(send.created_at) > RUN_WINDOW_MS) continue;
    if (!newest.has(send.job_id)) newest.set(send.job_id, send);
  }
  const run = [...newest.values()].filter((send) => !send.finished_at || now - Date.parse(send.finished_at) < WAITS_ON_BAR_MS
    || send.status === "code_needed")
    .filter((send) => !send.stopped && !(applied.has(send.job_id) && WAITS.has(send.status)));
  const going = run.filter((send) => GOING.has(send.status));
  const stopped = (send: ApplySend) => send.status === "needs_you" && send.needs.length > 0 && !lapsed(send, now);
  // Several stops whose questions the one sheet takes are one ask, not one
  // after another (owner, 2026-11-08: Stripe's three replaced Reddit's one,
  // then Reddit's came back).
  const answerable = run.filter((send) => stopped(send) && send.needs.every(canAnswer));
  const code = run.find((send) => send.status === "code_needed");
  const waiting = code ?? (answerable.length > 1 ? null : run.find((send) => stopped(send) || send.status === "blocked"));
  if (going.length === 0 && !waiting && answerable.length < 2) return null;
  const sent = run.filter((send) => send.status === "submitted" || send.status === "unconfirmed");
  const current = going.find((send) => send.status !== "queued") ?? going[0] ?? null;
  const queue = { now: current, next: going.filter((send) => send !== current), sent };
  const name = (send: ApplySend) => send.company ?? "the company";
  // While one waits, the rest keep going, and the bar says so.
  const detail = going.length > 0 ? `${going.length} applying` : undefined;
  if (waiting) {
    const asks = waiting.status === "code_needed" ? { words: `${name(waiting)} needs Greenhouse's code`, action: "Enter" }
      : waiting.status === "blocked" ? { words: `${name(waiting)} needs you`, action: "Finish" }
      : { words: `${name(waiting)} needs ${waiting.needs.length === 1 ? "1 answer" : `${waiting.needs.length} answers`}`, action: "Answer" };
    return { state: { kind: "needs", company: name(waiting), ...asks, ...(detail ? { detail } : {}) }, queue, jobId: waiting.job_id };
  }
  if (answerable.length > 1) {
    return { state: { kind: "needs", company: "", words: `${answerable.length} jobs need answers`, action: "Answer", group: true, ...(detail ? { detail } : {}) }, queue, jobId: null };
  }
  const done = run.length - going.length;
  // One application counts its fields, then says it's checking the filled
  // form and sending it, rather than sitting on "15 of 15" (owner,
  // 2026-11-08); several count applications.
  const fields = run.length === 1 ? current!.progress : null;
  const state: LiveBarState = run.length === 1 && current!.status === "submitting"
    ? { kind: "sending", company: name(current!), count: "Sending", share: 1 }
    : fields
    ? { kind: "sending", company: name(current!), count: fields.filled >= fields.of ? "Checking" : `${fields.filled} of ${fields.of}`, share: fields.filled / Math.max(fields.of, 1) }
    : run.length === 1
      ? { kind: "sending", company: name(current!), count: "", share: 0.04 }
      : { kind: "sending", company: name(current!), count: `${done + 1} of ${run.length}`, share: done / run.length };
  return { state, queue, jobId: current?.job_id ?? null };
}

/** The bar's last word once a run ends (4.3, Done): how many went, and how
 * many a thank-you page confirmed. Null when nothing was sent. */
export function liveBarDone(sent: readonly ApplySend[]): { words: string; detail?: string } | null {
  if (sent.length === 0) return null;
  const confirmed = sent.filter((send) => send.status === "submitted").length;
  if (sent.length === 1) return { words: `Sent to ${sent[0]!.company ?? "the company"}`, detail: confirmed ? "Confirmed" : undefined };
  return { words: `${sent.length} sent`, detail: `${confirmed} confirmed so far` };
}
