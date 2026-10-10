import { Tooltip as BaseTooltip } from "@base-ui/react/tooltip";
import type { ReactElement, ReactNode } from "react";
import styles from "./Tooltip.module.css";

export interface TooltipProps {
  /** Should match the trigger's accessible name: tooltips are visual only. */
  content: string;
  side?: "top" | "bottom" | "left" | "right";
  /** A kit control that passes props and ref through (Button, IconButton). */
  children: ReactElement;
}

/** A hover and focus label for icon-only controls on desktop. Base UI turns
 * tooltips off for touch, so nothing essential may live only here; use
 * `InfoTip` for explanations. */
export function Tooltip({ content, side = "top", children }: TooltipProps) {
  return <BaseTooltip.Root>
    <BaseTooltip.Trigger render={children} />
    <BaseTooltip.Portal>
      <BaseTooltip.Positioner className={styles.positioner} side={side} sideOffset={8} collisionPadding={12}>
        <BaseTooltip.Popup className={styles.popup}>{content}</BaseTooltip.Popup>
      </BaseTooltip.Positioner>
    </BaseTooltip.Portal>
  </BaseTooltip.Root>;
}

/** Mount once at the root so neighbouring tooltips open instantly after the
 * first one. */
export function TooltipProvider({ children }: { children: ReactNode }) {
  return <BaseTooltip.Provider delay={500} closeDelay={0}>{children}</BaseTooltip.Provider>;
}
