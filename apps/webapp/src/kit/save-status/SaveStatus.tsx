import { WarningCircle } from "@phosphor-icons/react";
import { VisuallyHidden } from "../visually-hidden/VisuallyHidden";
import styles from "./SaveStatus.module.css";

export type SavePhase = "clean" | "dirty" | "saving" | "saved" | "error";

export interface SaveStatusProps {
  phase: SavePhase;
  savedLabel?: string;
  errorMessage?: string | null;
  onRetry?: () => void;
}

/**
 * Autosave only shows itself when a save fails: "Not saved" with Retry.
 * Saving and saved stay silent on screen (saves are quick), and screen
 * readers still hear "Saved".
 */
export function SaveStatus({ phase, savedLabel = "Saved", errorMessage, onRetry }: SaveStatusProps) {
  return <>
    <VisuallyHidden><span role="status" aria-live="polite" aria-atomic>
      {phase === "error" ? `Not saved. ${errorMessage ?? "Try again."}` : phase === "saved" ? savedLabel : ""}
    </span></VisuallyHidden>
    {phase === "error" && <span className={styles.root}>
      <span className={styles.content}>
        <WarningCircle size={13} aria-hidden />
        <span>Not saved</span>
      </span>
      {onRetry && <button
        type="button"
        className={styles.retry}
        aria-label={errorMessage ? `Save failed: ${errorMessage}. Retry saving` : "Save failed. Retry saving"}
        onClick={onRetry}
      >Retry</button>}
    </span>}
  </>;
}
