import { useSyncExternalStore } from "react";

/**
 * Kit only: new postings can't be summoned, so this hides the top of your
 * real Jobs list for a moment, then lets those rows arrive through the same
 * path a refresh takes.
 */
export const HELD_BACK = 3;
const HOLD_MS = 2200;

let holding = false;
const listeners = new Set<() => void>();
function set(next: boolean) {
  holding = next;
  for (const listener of listeners) listener();
}
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export function showPostingsArriving() {
  set(true);
  setTimeout(() => set(false), HOLD_MS);
}

export function useHoldingPostings(): boolean {
  return useSyncExternalStore(subscribe, () => holding);
}
