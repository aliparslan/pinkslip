import { useSyncExternalStore } from "react";
import { storage } from "../../platform/storage";

const KEY = "redesign";
const listeners = new Set<() => void>();

/** The redesign kit (samples and options being compared) and the owner's
 * update channel: development builds, and updates published for the owner's
 * phone with EXPO_PUBLIC_REDESIGN=1. TestFlight's own updates never set it. */
export const redesignKitAvailable = __DEV__ || process.env.EXPO_PUBLIC_REDESIGN === "1";

/** The October 2026 redesign (docs/redesign-wireframes.md) is on for every
 * TestFlight tester (owner, 2026-10-16: let them play with it and send
 * feedback, unfinished parts and all). Only the kit can switch back. */
export function redesignEnabled(): boolean {
  return storage.getString(KEY) !== "off";
}

export function setRedesignEnabled(enabled: boolean) {
  if (enabled) storage.remove(KEY);
  else storage.set(KEY, "off");
  for (const listener of listeners) listener();
}

export function useRedesign(): boolean {
  return useSyncExternalStore((listener) => { listeners.add(listener); return () => listeners.delete(listener); }, redesignEnabled);
}
