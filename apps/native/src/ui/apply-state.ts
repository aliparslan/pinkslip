import type { ApplicationStage } from "@pinkslip/core/api";

/** Where an application stands, as the job page's one button shows it. */
export type ApplyState =
  /** You apply yourself, and Pinkslip fills the form (everyone). */
  | { kind: "apply"; closed?: boolean }
  /** Pro: Pinkslip sends it; the caret holds "Apply myself". */
  | { kind: "applyForMe" }
  | { kind: "queued"; ahead: number }
  /** Pinkslip's browser is opening the form, before anything is filled. */
  | { kind: "opening" }
  /** The button fills as the form does. */
  | { kind: "applying"; filled: number; of: number }
  /** Everything's filled and Submit is being pressed. */
  | { kind: "sending"; company: string }
  /** Pink again: the thing to do, as a verb. */
  | { kind: "needsYou"; questions: number }
  /** Check first filled it and stopped short of Submit; nothing was sent. */
  | { kind: "checked" }
  /** Greenhouse emailed a code, and the form waits for it. */
  | { kind: "code" }
  /** A captcha came up: assisted apply opens on the phone, already filled. */
  | { kind: "finishOnPhone" }
  /** It broke before Submit, so nothing went out; the send was given back. */
  | { kind: "didntSend" }
  /** Until the board or the company's email confirms it. */
  | { kind: "sent"; company: string }
  | { kind: "applied"; date: string | null }
  /** Later visits: where it stands, one tap to its page. */
  | { kind: "stage"; stage: ApplicationStage; label: string };
