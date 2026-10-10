import { Check, CircleNotch, WarningCircle } from "@phosphor-icons/react";
import { VisuallyHidden } from "../visually-hidden/VisuallyHidden";
import styles from "./SaveStatus.module.css";

export type SavePhase = "clean" | "dirty" | "saving" | "saved" | "error";

export interface SaveStatusProps {
  phase: SavePhase;
  savedLabel?: string;
  /** Icon only for saving and saved; the words stay for screen readers. */
  compact?: boolean;
  errorMessage?: string | null;
  onRetry?: () => void;
}

const messages: Record<SavePhase, string> = {
  clean: "",
  dirty: "Unsaved",
  saving: "Saving…",
  saved: "Saved",
  error: "Not saved",
};

export function SaveStatus({ phase, savedLabel = "Saved", compact, errorMessage, onRetry }: SaveStatusProps) {
  const message = phase === "saved" ? savedLabel : messages[phase];
  const hideLabel = compact && (phase === "saving" || phase === "saved");
  const live = phase !== "error";

  return <span className={styles.root} data-phase={phase} data-compact={compact || undefined}>
    <span
      className={styles.content}
      data-visible={message.length > 0 || undefined}
      role={live ? "status" : undefined}
      aria-live={live ? "polite" : undefined}
      aria-atomic={live ? true : undefined}
    >
      {phase === "saving" && <CircleNotch className={styles.spinner} size={13} aria-hidden />}
      {phase === "saved" && <Check size={13} aria-hidden />}
      {phase === "error" && <WarningCircle size={13} aria-hidden />}
      {hideLabel ? <VisuallyHidden>{message}</VisuallyHidden> : <span>{message}</span>}
    </span>
    {phase === "error" && onRetry && <button
      type="button"
      className={styles.retry}
      aria-label={errorMessage ? `Save failed: ${errorMessage}. Retry saving` : "Save failed. Retry saving"}
      onClick={onRetry}
    >Retry</button>}
  </span>;
}
