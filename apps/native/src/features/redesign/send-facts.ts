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

/** A question the app can ask and send back: it has a ref, and it isn't the
 * form's own error message or a file to upload. */
export const canAnswer = (need: SendNeed) => Boolean(need.ref) && need.kind !== "error" && need.kind !== "file";

const monthDay = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });

/** The button for where a send stands; null to leave the page's own. */
export function sendButtonState(send: ApplySend | null, company: string): ApplyState | null {
  if (!send) return null;
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
