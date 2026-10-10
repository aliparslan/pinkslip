import styles from "./Shell.module.css";

/** The tilted pink slip, drawn in the accent color. */
export function BrandMark({ size = 23 }: { size?: number }) {
  return <svg
    className={styles.mark}
    width={size}
    height={Math.round(size * 1.08)}
    viewBox="0 0 24 26"
    fill="none"
    aria-hidden
  >
    <g transform="rotate(-6 12 13)">
      <rect x="2" y="1" width="20" height="24" rx="3" fill="currentColor" />
      <path d="M7 7.5h10M7 12h7.5M7 16.5h9" stroke="var(--color-accent-ink)" strokeWidth="1.5" strokeLinecap="round" opacity="0.52" />
    </g>
  </svg>;
}
