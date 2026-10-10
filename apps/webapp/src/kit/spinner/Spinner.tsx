import styles from "./Spinner.module.css";

export interface SpinnerProps {
  size?: 14 | 16 | 20 | 28;
  /** With a label it announces as a status; without one it is decorative. */
  label?: string;
}

/** Inherits `currentColor` so it matches the text beside it. Fades in after
 * a short delay so fast loads never flash a spinner. */
export function Spinner({ size = 16, label }: SpinnerProps) {
  return <svg
    className={styles.root}
    width={size}
    height={size}
    viewBox="0 0 16 16"
    fill="none"
    role={label ? "status" : undefined}
    aria-label={label}
    aria-hidden={label ? undefined : true}
  >
    <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2" />
    <path d="M8 1.5 A 6.5 6.5 0 0 1 14.5 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>;
}
