import { AlertDialog as BaseAlertDialog } from "@base-ui/react/alert-dialog";
import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import { Drawer as BaseDrawer } from "@base-ui/react/drawer";
import type { ComponentProps } from "react";
import { cn, styled } from "./lib/cn";

const backdrop =
  "motion-fade fixed inset-0 z-50 bg-scrim";

const centeredPopup =
  "ps-sheet fixed left-1/2 top-1/2 z-50 flex w-[calc(100vw-2rem)] max-w-110 -translate-x-1/2 -translate-y-1/2 flex-col gap-1.5 rounded-sheet p-6 outline-none motion-dialog";

const title = "font-heading text-title tracking-heading text-ink";
const description = "text-ui text-ink-2";
const actions = "mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end";

export function DialogActions({ className, ...props }: ComponentProps<"div">) {
  return <div {...props} className={cn(actions, className)} />;
}

export const Dialog = {
  Root: BaseDialog.Root,
  Trigger: BaseDialog.Trigger,
  Portal: BaseDialog.Portal,
  Backdrop: styled(BaseDialog.Backdrop, backdrop, "Dialog.Backdrop"),
  Popup: styled(BaseDialog.Popup, centeredPopup, "Dialog.Popup"),
  Title: styled(BaseDialog.Title, title, "Dialog.Title"),
  Description: styled(BaseDialog.Description, description, "Dialog.Description"),
  Close: BaseDialog.Close,
};

/** For confirmations that cannot be dismissed by tapping outside. */
export const AlertDialog = {
  Root: BaseAlertDialog.Root,
  Trigger: BaseAlertDialog.Trigger,
  Portal: BaseAlertDialog.Portal,
  Backdrop: styled(BaseAlertDialog.Backdrop, backdrop, "AlertDialog.Backdrop"),
  Popup: styled(BaseAlertDialog.Popup, centeredPopup, "AlertDialog.Popup"),
  Title: styled(BaseAlertDialog.Title, title, "AlertDialog.Title"),
  Description: styled(BaseAlertDialog.Description, description, "AlertDialog.Description"),
  Close: BaseAlertDialog.Close,
};

/** Bottom sheet. Swipe down to dismiss; the backdrop fades with the swipe. */
export const Drawer = {
  Root: BaseDrawer.Root,
  Trigger: BaseDrawer.Trigger,
  Portal: BaseDrawer.Portal,
  Backdrop: styled(BaseDrawer.Backdrop, "ps-drawer-backdrop fixed inset-0 z-50 bg-scrim", "Drawer.Backdrop"),
  Viewport: styled(BaseDrawer.Viewport, "fixed inset-0 z-50 flex items-end justify-center", "Drawer.Viewport"),
  Popup: styled(
    BaseDrawer.Popup,
    "ps-drawer ps-sheet ps-sheet--bottom relative flex max-h-[88dvh] w-full max-w-130 flex-col rounded-t-sheet outline-none",
    "Drawer.Popup",
  ),
  Content: styled(BaseDrawer.Content, "ps-drawer-content flex min-h-0 flex-col gap-1.5 overflow-y-auto px-5 pt-2", "Drawer.Content"),
  Title: styled(BaseDrawer.Title, title, "Drawer.Title"),
  Description: styled(BaseDrawer.Description, description, "Drawer.Description"),
  Close: BaseDrawer.Close,
};

export function DrawerHandle() {
  return <div aria-hidden="true" className="mx-auto mt-2.5 h-1 w-9 shrink-0 rounded-pill bg-line-2" />;
}
