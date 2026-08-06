export type ToastTone = "success" | "info" | "warning" | "error";

export interface ToastAction {
  label: string;
  run: () => void | Promise<void>;
}

export interface ToastInput {
  message: string;
  tone?: ToastTone;
  duration?: number | null;
  action?: ToastAction;
  dedupeKey?: string;
}

export interface ToastItem extends Required<Pick<ToastInput, "message" | "tone">> {
  id: string;
  duration: number | null;
  action?: ToastAction;
  dedupeKey?: string;
}

const DEFAULT_DURATION = 3_500;
const MAX_VISIBLE = 2;

/** Toasts carrying an action or an error persist until dismissed; everything
 *  else is routine confirmation and can time out. */
function resolveDuration(input: { duration?: number | null; action?: ToastAction }): number | null {
  if (input.duration !== undefined) return input.duration;
  return input.action ? null : DEFAULT_DURATION;
}

class FeedbackController {
  visible = $state<ToastItem[]>([]);
  private queued: ToastItem[] = [];
  private timers = new Map<string, number>();

  show(input: string | ToastInput): string {
    const normalized = typeof input === "string" ? { message: input } : input;
    const existing = normalized.dedupeKey
      ? [...this.visible, ...this.queued].find((toast) => toast.dedupeKey === normalized.dedupeKey)
      : undefined;

    if (existing) {
      existing.message = normalized.message;
      existing.tone = normalized.tone ?? existing.tone;
      existing.action = normalized.action;
      existing.duration = resolveDuration(normalized);
      if (this.visible.some((toast) => toast.id === existing.id)) this.startTimer(existing);
      return existing.id;
    }

    const toast: ToastItem = {
      id: crypto.randomUUID(),
      message: normalized.message,
      tone: normalized.tone ?? "info",
      duration: resolveDuration(normalized),
      action: normalized.action,
      dedupeKey: normalized.dedupeKey,
    };

    if (this.visible.length < MAX_VISIBLE) {
      this.visible.push(toast);
      this.startTimer(toast);
    } else {
      this.queued.push(toast);
    }
    return toast.id;
  }

  success(message: string, input: Omit<ToastInput, "message" | "tone"> = {}): string {
    return this.show({ ...input, message, tone: "success" });
  }

  warning(message: string, input: Omit<ToastInput, "message" | "tone"> = {}): string {
    return this.show({ ...input, message, tone: "warning" });
  }

  /** Errors persist until dismissed — an error that vanishes on a timer is one
   *  the user may never have read. Pass an explicit `duration` to override. */
  error(message: string, input: Omit<ToastInput, "message" | "tone"> = {}): string {
    return this.show({ duration: null, ...input, message, tone: "error" });
  }


  dismiss(id: string): void {
    this.clearTimer(id);
    const visibleIndex = this.visible.findIndex((toast) => toast.id === id);
    if (visibleIndex >= 0) {
      this.visible.splice(visibleIndex, 1);
      this.revealNext();
      return;
    }
    this.queued = this.queued.filter((toast) => toast.id !== id);
  }

  pause(id: string): void {
    this.clearTimer(id);
  }

  resume(id: string): void {
    const toast = this.visible.find((item) => item.id === id);
    if (toast) this.startTimer(toast);
  }

  clear(): void {
    for (const id of this.timers.keys()) this.clearTimer(id);
    this.visible.splice(0);
    this.queued = [];
  }

  private startTimer(toast: ToastItem): void {
    this.clearTimer(toast.id);
    if (toast.duration === null) return;
    const timer = window.setTimeout(() => this.dismiss(toast.id), toast.duration);
    this.timers.set(toast.id, timer);
  }

  private clearTimer(id: string): void {
    const timer = this.timers.get(id);
    if (timer !== undefined) window.clearTimeout(timer);
    this.timers.delete(id);
  }

  private revealNext(): void {
    const next = this.queued.shift();
    if (!next) return;
    this.visible.push(next);
    this.startTimer(next);
  }
}

export const feedback = new FeedbackController();
