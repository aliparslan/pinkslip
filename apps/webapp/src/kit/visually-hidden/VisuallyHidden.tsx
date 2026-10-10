import type { ReactNode } from "react";
import styles from "./VisuallyHidden.module.css";

/** Text for assistive technology only (`.sr-only`). */
export function VisuallyHidden({ children }: { children: ReactNode }) {
  return <span className={styles.root}>{children}</span>;
}
