import type { ReactNode } from "react";
import styles from "./Heading.module.css";

/**
 * The current app's heading roles, and only those:
 * - `root`: Jobs / Library / You root header titles
 * - `screen`: large title on pushed screens
 * - `display-lg|md|sm`: page, sheet/detail, and empty-state/sub-headings
 * - `section`: titles above grouped sections
 */
export type HeadingVariant = "root" | "screen" | "display-lg" | "display-md" | "display-sm" | "section";

export interface HeadingProps {
  level: 1 | 2 | 3 | 4;
  variant: HeadingVariant;
  id?: string;
  children: ReactNode;
}

export function Heading({ level, variant, id, children }: HeadingProps) {
  const Element = `h${level}` as const;
  return <Element id={id} className={styles.root} data-variant={variant}>{children}</Element>;
}
