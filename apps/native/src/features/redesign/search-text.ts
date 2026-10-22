import { useSyncExternalStore } from "react";

/**
 * What's typed in the Search tab's field. Jobs' "Search everything" hands
 * its words over through here too; Search's X empties it.
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
