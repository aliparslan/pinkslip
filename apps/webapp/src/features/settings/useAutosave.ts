import { useCallback, useEffect, useRef, useState } from "react";
import type { SavePhase } from "../../kit";

export interface Autosave {
  phase: SavePhase;
  /** Save now, e.g. from SaveStatus's Retry. */
  retry: () => void;
}

/**
 * Saves `value` a moment after it stops changing (`autosave-lifecycle.ts`):
 * one save at a time, edits made during a save are saved right after it, a
 * failure keeps the edit and offers Retry, and leaving the page saves what's
 * pending. The first value seen while `ready` is the saved baseline.
 */
export function useAutosave<T>({ value, ready, save, delay = 800 }: {
  value: T;
  ready: boolean;
  save: (value: T) => Promise<unknown>;
  delay?: number;
}): Autosave {
  const key = JSON.stringify(value);
  const [phase, setPhase] = useState<SavePhase>("clean");
  const saved = useRef<string | null>(null);
  const running = useRef(false);
  const latest = useRef({ key, value, save });
  latest.current = { key, value, save };
  const timer = useRef<number | null>(null);

  const run = useCallback(async (): Promise<void> => {
    if (running.current) return;
    const { key: sending, value: next, save: send } = latest.current;
    if (sending === saved.current) return;
    running.current = true;
    setPhase("saving");
    try {
      await send(next);
      saved.current = sending;
      running.current = false;
      if (latest.current.key !== sending) {
        await run();
        return;
      }
      setPhase("saved");
    } catch {
      running.current = false;
      setPhase("error");
    }
  }, []);

  useEffect(() => {
    if (!ready) return;
    if (saved.current === null) {
      saved.current = key;
      return;
    }
    if (key === saved.current) return;
    setPhase((current) => (current === "saving" ? current : "dirty"));
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      void run();
    }, delay);
  }, [key, ready, delay, run]);

  // Leaving the page saves what's pending.
  useEffect(() => () => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      void run();
    }
  }, [run]);

  return { phase, retry: () => void run() };
}
