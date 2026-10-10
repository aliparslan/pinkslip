import { useId } from "react";
import styles from "./Shell.module.css";

/** Two stacked pink slips, the front one cut out of the back one by a small
 * gap so they stay distinct at favicon size. The same geometry is in
 * `public/favicon.svg` and the generated PNG icons (`bun run icons`). A
 * placeholder until the commissioned logo. */
export function BrandMark({ size = 32 }: { size?: number }) {
  const gap = useId();
  return <svg className={styles.mark} width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden>
    <mask id={gap}>
      <rect width="32" height="32" fill="#fff" />
      <rect x="8" y="8.5" width="13" height="18.5" rx="2.4" fill="#000" stroke="#000" strokeWidth="3" transform="rotate(-5 14.5 17.75)" />
    </mask>
    <g mask={`url(#${gap})`}>
      <rect x="11" y="4.5" width="13" height="18.5" rx="2.4" fill="currentColor" opacity="0.5" transform="rotate(9 17.5 13.75)" />
    </g>
    <rect x="8" y="8.5" width="13" height="18.5" rx="2.4" fill="currentColor" transform="rotate(-5 14.5 17.75)" />
  </svg>;
}
