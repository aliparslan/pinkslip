import { useSyncExternalStore } from "react";
import { storage } from "../../platform/storage";

const KEY = "redesign";
const listeners = new Set<() => void>();

/** The October 2026 redesign (docs/redesign-wireframes.md) replaces screens as
 * they're built. Development builds show it by default and the redesign kit
 * screen can switch back; release builds keep today's screens until it ships. */
export function redesignEnabled(): boolean {
  return __DEV__ && storage.getString(KEY) !== "off";
}

export function setRedesignEnabled(enabled: boolean) {
  if (enabled) storage.remove(KEY);
  else storage.set(KEY, "off");
  for (const listener of listeners) listener();
}

export function useRedesign(): boolean {
  return useSyncExternalStore((listener) => { listeners.add(listener); return () => listeners.delete(listener); }, redesignEnabled);
}
