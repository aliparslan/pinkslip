import type { ReactNode } from "react";
import styles from "./Alert.module.css";

export type AlertTone = "error" | "success" | "warn";

export interface AlertProps {
  tone: AlertTone;
  id?: string;
  children: ReactNode;
}

/** Inline message banner. Errors are announced as they appear; success and
 * warnings are polite status updates. */
export function Alert({ tone, id, children }: AlertProps) {
  return <div id={id} className={styles.root} data-tone={tone} role={tone === "error" ? "alert" : "status"}>
    {children}
  </div>;
}
