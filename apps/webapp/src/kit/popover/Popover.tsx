import { Popover as BasePopover } from "@base-ui/react/popover";
import type { ReactElement, ReactNode } from "react";
import { Info } from "@phosphor-icons/react";
import styles from "./Popover.module.css";

type Side = "top" | "bottom" | "left" | "right";
type Align = "start" | "center" | "end";

interface PopupProps {
  title?: string;
  side?: Side;
  align?: Align;
  children: ReactNode;
}

function PopoverPopup({ title, side = "bottom", align = "center", children }: PopupProps) {
  return <BasePopover.Portal>
    <BasePopover.Positioner className={styles.positioner} side={side} align={align} sideOffset={8} collisionPadding={12}>
      <BasePopover.Popup className={styles.popup}>
        {title && <BasePopover.Title className={styles.title}>{title}</BasePopover.Title>}
        {children}
      </BasePopover.Popup>
    </BasePopover.Positioner>
  </BasePopover.Portal>;
}

export interface PopoverProps extends PopupProps {
  /** A kit control that passes props and ref through (Button, IconButton). */
  trigger: ReactElement;
}

/** A small card anchored to its trigger, opened by click or tap. For
 * content that needs the full screen on phones, use `Dialog`. */
export function Popover({ trigger, ...popup }: PopoverProps) {
  return <BasePopover.Root>
    <BasePopover.Trigger render={trigger} />
    <PopoverPopup {...popup} />
  </BasePopover.Root>;
}

export interface InfoTipProps {
  /** Accessible name of the ⓘ button, e.g. "About match scores". */
  label: string;
  title?: string;
  side?: Side;
  children: ReactNode;
}

/** An ⓘ that explains something in place: opens on hover with a mouse and
 * on tap with touch, so phones and screen readers reach it too. */
export function InfoTip({ label, title, side = "top", children }: InfoTipProps) {
  return <BasePopover.Root>
    <BasePopover.Trigger className={styles.infoTrigger} aria-label={label} openOnHover delay={200}>
      <Info size={16} weight="bold" aria-hidden focusable="false" />
    </BasePopover.Trigger>
    <PopoverPopup title={title} side={side}>{children}</PopoverPopup>
  </BasePopover.Root>;
}
