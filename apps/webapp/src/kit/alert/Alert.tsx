import type { ReactNode } from "react";
import type { Icon as PhosphorIcon } from "@phosphor-icons/react";
import styles from "./Alert.module.css";

export type AlertTone = "error" | "success" | "warning";

export interface AlertProps {
  tone: AlertTone;
  id?: string;
  /** A short bold line above the message (the inline failure's "Unable to load"). */
  title?: string;
  icon?: PhosphorIcon;
  /** One trailing control, usually a compact "Try again" button. */
  action?: ReactNode;
  /** `compact` is the one-line strip (offline, stale results). */
  size?: "default" | "compact";
  children: ReactNode;
}

/** Inline message banner. Errors are announced as they appear; success and
 * warnings are polite status updates. */
export function Alert({ tone, id, title, icon: Glyph, action, size = "default", children }: AlertProps) {
  return <div id={id} className={styles.root} data-tone={tone} data-size={size}
    data-layout={Glyph || action ? "row" : undefined}
    role={tone === "error" ? "alert" : "status"}>
    {Glyph && <Glyph className={styles.icon} size={size === "compact" ? 16 : 20} weight="bold" aria-hidden focusable="false" />}
    {title
      ? <div className={styles.copy}><strong className={styles.title}>{title}</strong><span>{children}</span></div>
      : <div className={styles.copy}>{children}</div>}
    {action && <div className={styles.action}>{action}</div>}
  </div>;
}
