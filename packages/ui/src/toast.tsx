import { Toast as BaseToast } from "@base-ui/react/toast";
import type { ReactNode } from "react";
import { CloseIcon } from "./icons";

export const ToastProvider = BaseToast.Provider;
export const useToastManager = BaseToast.useToastManager;

/** Optional data a toast can carry. `leading` shows before the text, such as
 * the company mark of the job that was just saved. */
export interface ToastData {
  leading?: ReactNode;
}

/** Renders the stack. Mount once, inside ToastProvider. Toasts stack behind
 * the newest, fan out on hover or focus, and swipe away down or sideways. */
export function Toaster() {
  return (
    <BaseToast.Portal>
      <BaseToast.Viewport className="ps-toast-viewport">
        <ToastList />
      </BaseToast.Viewport>
    </BaseToast.Portal>
  );
}

function ToastList() {
  const { toasts } = useToastManager();
  return toasts.map((toast) => (
    <BaseToast.Root
      key={toast.id}
      toast={toast}
      swipeDirection={["down", "right"]}
      className="ps-toast ps-surface rounded-surface"
    >
      <BaseToast.Content className="ps-toast-content flex items-start gap-3 p-3.5 pr-2.5">
        {(toast.data as ToastData | undefined)?.leading ? (
          <div className="flex shrink-0 items-center">{(toast.data as ToastData).leading}</div>
        ) : null}
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <BaseToast.Title className="text-ui font-medium text-ink" />
          <BaseToast.Description className="line-clamp-2 text-meta text-ink-2" />
        </div>
        <BaseToast.Action className="h-control-sm shrink-0 cursor-pointer rounded-inset px-2.5 text-meta font-medium text-accent-text hover:bg-accent-soft focus-ring" />
        <BaseToast.Close
          aria-label="Dismiss"
          className="flex size-control-sm shrink-0 cursor-pointer items-center justify-center rounded-inset text-ink-3 hover:bg-control hover:text-ink focus-ring"
        >
          <CloseIcon size={14} />
        </BaseToast.Close>
      </BaseToast.Content>
    </BaseToast.Root>
  ));
}
