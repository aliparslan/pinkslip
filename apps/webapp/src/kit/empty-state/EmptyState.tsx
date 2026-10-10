import type { ReactNode } from "react";
import type { Icon as PhosphorIcon } from "@phosphor-icons/react";
import { Heading } from "../heading/Heading";
import { Text } from "../text/Text";
import styles from "./EmptyState.module.css";

export interface EmptyStateProps {
  title: string;
  message?: string;
  icon?: PhosphorIcon;
  /** Buttons or links, centered under the message. */
  actions?: ReactNode;
  /** 1 when the state is the whole page (404, route error). */
  level?: 1 | 2;
  /** Failures are announced; ordinary empty states aren't. */
  alert?: boolean;
  /** Tighter padding for a state inside a list or card. */
  compact?: boolean;
}

/** A centered message for an empty list, a missing page or a failed load. */
export function EmptyState({ title, message, icon: Glyph, actions, level = 2, alert, compact }: EmptyStateProps) {
  return <section className={styles.root} role={alert ? "alert" : undefined} data-compact={compact || undefined}>
    {Glyph && <div className={styles.icon} aria-hidden><Glyph size={24} weight="bold" /></div>}
    <Heading level={level} variant={compact ? "section" : "display-sm"}>{title}</Heading>
    {message && <div className={styles.message}><Text size="sm" tone="ink-3">{message}</Text></div>}
    {actions && <div className={styles.actions}>{actions}</div>}
  </section>;
}
