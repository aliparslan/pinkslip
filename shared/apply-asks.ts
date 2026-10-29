/* Asking as strong matches post (owner, 2026-10-29; Decisions: Auto-apply #2,
 * revisited). A strong match asks with one push, "Apply for you?", or with
 * Apply for me (Pro) is sent with no ask. */

/** Ask me (the default, Pro included), Apply for me (Pro), or neither. */
export const AUTO_APPLY_MODES = ["ask", "auto", "off"] as const;
export type AutoApplyMode = (typeof AUTO_APPLY_MODES)[number];

/** How long Pause lasts. */
export const AUTO_APPLY_PAUSES = ["day", "week", "until_resumed"] as const;
export type AutoApplyPause = (typeof AUTO_APPLY_PAUSES)[number];

export interface AutoApplySettings {
  mode: AutoApplyMode;
  /** Nothing is asked or sent before this; null when not paused. */
  paused_until: string | null;
  /** Paused until turned back on, rather than for a day or a week. */
  paused_indefinitely: boolean;
  /** Apply for me is Pro. */
  can_automate: boolean;
}

/** The push's two buttons: Apply starts the send, Not this one dismisses the job. */
export type ApplyAskAction = "apply" | "dismiss";

/** The push's category, which the app registers with its two buttons. */
export const APPLY_ASK_CATEGORY = "apply_ask";
