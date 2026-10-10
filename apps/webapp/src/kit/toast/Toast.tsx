import { Toast } from "@base-ui/react/toast";
import { useEffect, type ReactNode } from "react";
import { CheckCircle, Info, Warning, WarningCircle, X } from "@phosphor-icons/react";
import styles from "./Toast.module.css";

export type ToastTone = "success" | "info" | "warning" | "error";

export interface ToastAction {
  label: string;
  run: () => void | Promise<void>;
}

export interface ToastInput {
  message: string;
  tone?: ToastTone;
  /** Milliseconds; `null` keeps it until dismissed. Defaults to 3.5s, or
   * until dismissed when there's an action. */
  duration?: number | null;
  action?: ToastAction;
  /** Showing a toast with the same key updates it instead of stacking. */
  dedupeKey?: string;
}

const DEFAULT_DURATION = 3_500;
export const UNDO_TOAST_DURATION = 7_000;
const MAX_VISIBLE = 2;

const manager = Toast.createToastManager();

function resolveTimeout(input: ToastInput): number {
  const duration = input.duration !== undefined ? input.duration : input.action ? null : DEFAULT_DURATION;
  return duration ?? 0;
}

// Effects run child-first, so a page can call `toast` on its first render
// before the provider below has subscribed to the manager. Hold those
// messages and replay them once the provider mounts.
let providerMounted = false;
const early: Array<() => void> = [];

function show(input: string | ToastInput): string {
  const toast = typeof input === "string" ? { message: input } : input;
  if (!providerMounted) {
    const id = toast.dedupeKey ?? `early-${early.length}-${Date.now()}`;
    early.push(() => show({ ...toast, dedupeKey: id }));
    return id;
  }
  const tone = toast.tone ?? "info";
  return manager.add({
    id: toast.dedupeKey,
    description: toast.message,
    type: tone,
    timeout: resolveTimeout(toast),
    priority: tone === "error" ? "high" : "low",
    data: toast.action ? { action: toast.action } : undefined,
  });
}

type ToneInput = Omit<ToastInput, "message" | "tone">;

/** App-wide messages, callable from anywhere (mutations, route errors). */
export const toast = {
  show,
  success: (message: string, input: ToneInput = {}) => show({ ...input, message, tone: "success" }),
  warning: (message: string, input: ToneInput = {}) => show({ ...input, message, tone: "warning" }),
  error: (message: string, input: ToneInput = {}) => show({ ...input, message, tone: "error" }),
  dismiss: (id: string) => manager.close(id),
};

const icons = { success: CheckCircle, warning: Warning, error: WarningCircle, info: Info };

function ToastList() {
  const { toasts } = Toast.useToastManager();
  return toasts.map((item) => {
    const tone = (item.type ?? "info") as ToastTone;
    const Glyph = icons[tone] ?? Info;
    const action = (item.data as { action?: ToastAction } | undefined)?.action;
    return <Toast.Root key={item.id} toast={item} className={styles.toast} swipeDirection={["left", "right"]}>
      <span className={styles.icon}><Glyph size={18} weight="fill" aria-hidden /></span>
      <Toast.Description className={styles.message} />
      {action && <button
        type="button"
        className={styles.action}
        onClick={async () => {
          await action.run();
          manager.close(item.id);
        }}
      >{action.label}</button>}
      {item.timeout === 0 && <Toast.Close className={styles.close} aria-label="Dismiss message">
        <X size={16} weight="bold" aria-hidden />
      </Toast.Close>}
    </Toast.Root>;
  });
}

/** Mount once at the root. */
export function ToastProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    providerMounted = true;
    early.splice(0).forEach((replay) => replay());
    return () => { providerMounted = false; };
  }, []);
  return <Toast.Provider toastManager={manager} limit={MAX_VISIBLE}>
    {children}
    <Toast.Portal>
      <Toast.Viewport className={styles.viewport}>
        <ToastList />
      </Toast.Viewport>
    </Toast.Portal>
  </Toast.Provider>;
}
