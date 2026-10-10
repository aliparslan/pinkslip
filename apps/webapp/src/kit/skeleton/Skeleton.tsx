import type { CSSProperties } from "react";
import styles from "./Skeleton.module.css";

/** A pulsing placeholder block. Size it with custom properties, e.g.
 * `<Skeleton width="60%" height="var(--fs-md)" />`. */
export function Skeleton({ width = "100%", height = "1em" }: { width?: string; height?: string }) {
  return <span
    className={styles.root}
    aria-hidden
    style={{ "--skeleton-width": width, "--skeleton-height": height } as CSSProperties}
  />;
}
