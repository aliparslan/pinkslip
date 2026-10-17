import { useSyncExternalStore } from "react";

/**
 * What's typed in the Search tab's field. The field lives in the tab bar
 * (iOS 26 puts it at the bottom) and the results on the screen, so both
 * read it from here; it stays when you leave the tab and come back.
 */
let text = "";
const listeners = new Set<() => void>();

export function setSearchText(next: string) {
  if (next === text) return;
  text = next;
  for (const listener of listeners) listener();
}

export function useSearchText(): string {
  return useSyncExternalStore((listener) => { listeners.add(listener); return () => listeners.delete(listener); }, () => text);
}
