import type { ReactNode } from "react";
import { cx } from "../cx";
import styles from "./Surface.module.css";

export interface SurfaceProps {
  /** `list` groups rows edge to edge (`.surface-list`); `card` pads its
   * content (`.content-card`). */
  variant: "list" | "card";
  /** Phones show grouped lists edge to edge, as on You, Companies, Library
   * and Admin. Only use inside a page that has the screen gutter. */
  bleedOnPhone?: boolean;
  as?: "div" | "section" | "ul" | "article";
  "aria-labelledby"?: string;
  className?: string;
  children: ReactNode;
}

export function Surface({ variant, bleedOnPhone, as: Element = "div", className, children, ...aria }: SurfaceProps) {
  return <Element
    {...aria}
    className={cx(styles.root, className)}
    data-variant={variant}
    data-bleed={bleedOnPhone || undefined}
  >{children}</Element>;
}
