import { useSyncExternalStore } from "react";
import { storage } from "../../platform/storage";
import { DEFAULT_SWIPES, repairSwipes, sameSwipes, withSwipe, type SwipeChoice, type SwipeChoices, type SwipeSide } from "./swipe-rules";

export * from "./swipe-rules";

/** Your swipe actions, kept on this phone like Appearance. */
const KEY = "swipe-choices";
const listeners = new Set<() => void>();
let cache: { raw: string | undefined; value: SwipeChoices } | null = null;

function read(): SwipeChoices {
  const raw = storage.getString(KEY);
  if (cache && cache.raw === raw) return cache.value;
  let value = DEFAULT_SWIPES;
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as { right?: unknown; left?: unknown };
      if (Array.isArray(parsed.right) && Array.isArray(parsed.left)) value = repairSwipes({ right: parsed.right, left: parsed.left });
    } catch {
      value = DEFAULT_SWIPES;
    }
  }
  cache = { raw, value };
  return value;
}

export function useSwipeChoices(): SwipeChoices {
  return useSyncExternalStore((listener) => { listeners.add(listener); return () => listeners.delete(listener); }, read);
}

export function chooseSwipe(side: SwipeSide, slot: 0 | 1, choice: SwipeChoice | null) {
  const value = withSwipe(read(), side, slot, choice);
  if (sameSwipes(value, DEFAULT_SWIPES)) storage.remove(KEY);
  else storage.set(KEY, JSON.stringify(value));
  for (const listener of listeners) listener();
}
