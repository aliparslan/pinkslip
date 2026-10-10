import { AlertDialog as BaseAlertDialog } from "@base-ui/react/alert-dialog";
import { Drawer } from "@base-ui/react/drawer";
import type { ReactNode } from "react";
import { X } from "@phosphor-icons/react";
import { Button } from "../button/Button";
import { cx } from "../cx";
import headingStyles from "../heading/Heading.module.css";
import iconButtonStyles from "../icon-button/IconButton.module.css";
import styles from "./Dialog.module.css";

interface OverlayProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** While true the overlay can't be dismissed (a save is in flight). */
  busy?: boolean;
  children: ReactNode;
}

function guardedChange(busy: boolean | undefined, onOpenChange: (open: boolean) => void) {
  return (next: boolean) => {
    if (!next && busy) return;
    onOpenChange(next);
  };
}

function CloseButton({ label, busy, size = 20 }: { label: string; busy?: boolean; size?: 18 | 20 }) {
  return <Drawer.Close className={cx(iconButtonStyles.root, styles.close)} data-size="default" aria-label={label} disabled={busy}>
    <X size={size} aria-hidden focusable="false" />
  </Drawer.Close>;
}

export interface DialogProps extends OverlayProps {
  subtitle?: string;
  /** sm 340px (confirmations), md 380px, lg 560px. */
  size?: "sm" | "md" | "lg";
}

/** Modal.svelte: a centered card on wide screens and a swipe-to-dismiss
 * bottom sheet at 640px and below. */
export function Dialog({ open, onOpenChange, title, subtitle, busy, size = "md", children }: DialogProps) {
  return <Drawer.Root open={open} onOpenChange={guardedChange(busy, onOpenChange)} disablePointerDismissal={busy}>
    <Drawer.Portal>
      <Drawer.Backdrop className={styles.backdrop} data-variant="dialog" />
      <Drawer.Viewport className={styles.viewport} data-variant="dialog">
        <Drawer.Popup className={styles.card} data-size={size}>
          <Drawer.Content>
            <div className={styles.handle} aria-hidden />
            <div className={styles.header}>
              <Drawer.Title className={cx(headingStyles.root, styles.title)} data-variant="display-md">{title}</Drawer.Title>
              {subtitle && <Drawer.Description className={styles.subtitle}>{subtitle}</Drawer.Description>}
            </div>
            {children}
          </Drawer.Content>
          <CloseButton label="Close" busy={busy} />
        </Drawer.Popup>
      </Drawer.Viewport>
    </Drawer.Portal>
  </Drawer.Root>;
}

export interface SheetProps extends OverlayProps {
  closeLabel?: string;
  /** Pinned actions under the scrolling body, e.g. Reset and Apply. */
  footer?: ReactNode;
}

/** The feed filter sheet: a bottom sheet at every width, with a fixed
 * header and footer around a scrolling body. */
export function Sheet({ open, onOpenChange, title, busy, closeLabel = "Close", footer, children }: SheetProps) {
  return <Drawer.Root open={open} onOpenChange={guardedChange(busy, onOpenChange)} disablePointerDismissal={busy}>
    <Drawer.Portal>
      <Drawer.Backdrop className={styles.backdrop} data-variant="sheet" />
      <Drawer.Viewport className={styles.viewport} data-variant="sheet">
        <Drawer.Popup className={styles.sheet}>
          <div className={styles.handle} aria-hidden />
          <div className={styles.sheetHeader}>
            <Drawer.Title className={headingStyles.root} data-variant="display-md">{title}</Drawer.Title>
            <Drawer.Close className={iconButtonStyles.root} data-size="default" aria-label={closeLabel} disabled={busy}>
              <X size={18} aria-hidden focusable="false" />
            </Drawer.Close>
          </div>
          <Drawer.Content className={styles.sheetBody}>{children}</Drawer.Content>
          {footer && <div className={styles.sheetFooter}>{footer}</div>}
        </Drawer.Popup>
      </Drawer.Viewport>
    </Drawer.Portal>
  </Drawer.Root>;
}

export interface AlertDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  /** `danger` for destructive actions (delete account). */
  tone?: "accent" | "danger";
  /** The confirm action is running: both buttons disable and it can't close. */
  pending?: boolean;
  onConfirm: () => void;
}

/** A yes/no confirmation. Unlike `Dialog` it doesn't close on an outside
 * click or a swipe: the person has to choose. */
export function AlertDialog({
  open, onOpenChange, title, description, confirmLabel, tone = "accent", pending, onConfirm,
}: AlertDialogProps) {
  return <BaseAlertDialog.Root open={open} onOpenChange={guardedChange(pending, onOpenChange)}>
    <BaseAlertDialog.Portal>
      <BaseAlertDialog.Backdrop className={styles.backdrop} data-variant="dialog" />
      <BaseAlertDialog.Viewport className={styles.viewport} data-variant="dialog">
        <BaseAlertDialog.Popup className={styles.card} data-size="sm">
          <div className={styles.header}>
            <BaseAlertDialog.Title className={cx(headingStyles.root, styles.title)} data-variant="display-md">{title}</BaseAlertDialog.Title>
            <BaseAlertDialog.Description className={styles.subtitle}>{description}</BaseAlertDialog.Description>
          </div>
          <div className={styles.actions}>
            <Button variant="secondary" disabled={pending} onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button variant={tone} pending={pending} onClick={onConfirm}>{confirmLabel}</Button>
          </div>
        </BaseAlertDialog.Popup>
      </BaseAlertDialog.Viewport>
    </BaseAlertDialog.Portal>
  </BaseAlertDialog.Root>;
}
