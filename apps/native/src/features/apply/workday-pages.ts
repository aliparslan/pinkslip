import { useSyncExternalStore } from "react";
import { storage } from "../../platform/storage";

/**
 * Filling Workday page by page, dropdowns included. Nobody has run it through
 * a real application on a phone yet, so it stays off until Kit switches it
 * on, kept on this phone.
 */
const KEY = "kit-workday-pages";
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };

export function setWorkdayPages(on: boolean) {
  if (on) storage.set(KEY, "on");
  else storage.remove(KEY);
  for (const listener of listeners) listener();
}

export function useWorkdayPages(): boolean {
  return useSyncExternalStore(subscribe, () => storage.getString(KEY) === "on");
}
