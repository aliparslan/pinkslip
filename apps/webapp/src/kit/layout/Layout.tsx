import type { ReactNode } from "react";
import type { SpaceToken } from "@pinkslip/tokens/types";
import { cx } from "../cx";
import styles from "./Layout.module.css";

type LayoutElement = "div" | "section" | "ul" | "ol" | "li" | "nav" | "header" | "footer" | "form";

interface LayoutProps {
  as?: LayoutElement;
  gap?: SpaceToken;
  /** Placement within the parent only (margin, grid area, width). */
  className?: string;
  children: ReactNode;
}

/** Vertical rhythm. The Svelte `.stack-sm|md|lg` are gaps "2", "3" and "4". */
export function Stack({ as: Element = "div", gap = "3", className, children }: LayoutProps) {
  return <Element className={cx(styles.stack, className)} data-gap={gap}>{children}</Element>;
}

export interface InlineProps extends LayoutProps {
  align?: "center" | "start" | "end" | "baseline";
  /** `between` is the Svelte `.split-row`. */
  justify?: "start" | "center" | "end" | "between";
  /** Wrapping rows are the Svelte `.button-cluster`. */
  wrap?: boolean;
  /** Take the remaining width in a parent row (`.flex-fill`). */
  fill?: boolean;
}

export function Inline({ as: Element = "div", gap = "2", align = "center", justify = "start", wrap, fill, className, children }: InlineProps) {
  return <Element
    className={cx(styles.inline, className)}
    data-gap={gap}
    data-align={align}
    data-justify={justify}
    data-wrap={wrap || undefined}
    data-fill={fill || undefined}
  >{children}</Element>;
}
