import type { ReactNode } from "react";
import styles from "./Text.module.css";

export type TextSize = "2xs" | "xs" | "sm" | "md" | "lg";
export type TextTone = "ink" | "ink-2" | "ink-3" | "ink-4" | "accent" | "good" | "warn" | "bad";
export type TextWeight = "regular" | "medium" | "semibold";

export interface TextProps {
  as?: "p" | "span" | "div" | "strong";
  size?: TextSize;
  tone?: TextTone;
  weight?: TextWeight;
  /** One line with an ellipsis; the parent must allow it to shrink. */
  truncate?: boolean;
  /** Fixed-width digits for counts that change while the user filters. */
  tabular?: boolean;
  id?: string;
  children: ReactNode;
}

/** Body and supporting text. Hierarchy comes from tone and weight first;
 * size stays on the existing scale. */
export function Text({ as: Element = "p", size = "md", tone = "ink", weight = "regular", truncate, tabular, id, children }: TextProps) {
  return <Element
    id={id}
    className={styles.root}
    data-size={size}
    data-tone={tone}
    data-weight={weight}
    data-truncate={truncate || undefined}
    data-tabular={tabular || undefined}
  >{children}</Element>;
}
