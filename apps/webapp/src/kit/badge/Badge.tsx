import type { ReactNode } from "react";
import styles from "./Badge.module.css";

/** A small, non-interactive label (`.tag`), e.g. "Internship" on a job row.
 * Selectable chips are a different control (ToggleGroup, 2.2). */
export function Badge({ children }: { children: ReactNode }) {
  return <span className={styles.root}>{children}</span>;
}
