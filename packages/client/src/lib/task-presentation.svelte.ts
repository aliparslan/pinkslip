export const PENDING_DELAY_MS = 280;
export const MIN_PENDING_DWELL_MS = 600;
export const SAVED_DWELL_MS = 1_800;

export type SavePhase = "clean" | "dirty" | "saving" | "saved" | "error";

export class SavePresentation {
  phase = $state<SavePhase>("clean");
  savedAt = $state<string | null>(null);
  errorMessage = $state<string | null>(null);

  private generation = 0;
  private pendingTimer: number | null = null;
  private settleTimer: number | null = null;
  private savingShownAt = 0;

  markDirty(): void {
    this.generation += 1;
    this.clearTimers();
    this.errorMessage = null;
    this.phase = "dirty";
  }

  begin(): number {
    const generation = ++this.generation;
    this.clearTimers();
    this.errorMessage = null;
    this.pendingTimer = window.setTimeout(() => {
      if (generation !== this.generation) return;
      this.savingShownAt = performance.now();
      this.phase = "saving";
      this.pendingTimer = null;
    }, PENDING_DELAY_MS);
    return generation;
  }

  succeed(generation: number, savedAt = new Date().toISOString()): void {
    if (generation !== this.generation) return;
    if (this.pendingTimer !== null) {
      window.clearTimeout(this.pendingTimer);
      this.pendingTimer = null;
    }

    const remaining = this.phase === "saving"
      ? Math.max(0, MIN_PENDING_DWELL_MS - (performance.now() - this.savingShownAt))
      : 0;

    this.settleTimer = window.setTimeout(() => {
      if (generation !== this.generation) return;
      this.savedAt = savedAt;
      this.phase = "saved";
      this.settleTimer = window.setTimeout(() => {
        if (generation === this.generation) this.phase = "clean";
      }, SAVED_DWELL_MS);
    }, remaining);
  }

  fail(generation: number, message: string): void {
    if (generation !== this.generation) return;
    this.clearTimers();
    this.errorMessage = message;
    this.phase = "error";
  }

  hydrate(savedAt: string | null): void {
    this.clearTimers();
    this.savedAt = savedAt;
    this.phase = "clean";
  }

  destroy(): void {
    this.generation += 1;
    this.clearTimers();
  }

  private clearTimers(): void {
    if (this.pendingTimer !== null) window.clearTimeout(this.pendingTimer);
    if (this.settleTimer !== null) window.clearTimeout(this.settleTimer);
    this.pendingTimer = null;
    this.settleTimer = null;
  }
}

export async function presentPending<T>(
  task: () => Promise<T>,
  setPending: (pending: boolean) => void,
): Promise<T> {
  let shownAt = 0;
  let shown = false;
  const timer = window.setTimeout(() => {
    shown = true;
    shownAt = performance.now();
    setPending(true);
  }, PENDING_DELAY_MS);

  try {
    return await task();
  } finally {
    window.clearTimeout(timer);
    if (shown) {
      const remaining = Math.max(0, MIN_PENDING_DWELL_MS - (performance.now() - shownAt));
      if (remaining > 0) await new Promise<void>((resolve) => window.setTimeout(resolve, remaining));
      setPending(false);
    }
  }
}
