import { useSyncExternalStore } from "react";
import { storage } from "../../platform/storage";

const KEY = "redesign";
const listeners = new Set<() => void>();

/** Development builds, and a release build made for the owner's phone with
 * EXPO_PUBLIC_REDESIGN=1. TestFlight and App Store builds never set it. */
const AVAILABLE = __DEV__ || process.env.EXPO_PUBLIC_REDESIGN === "1";

/** The October 2026 redesign (docs/redesign-wireframes.md) replaces screens as
 * they're built. Where it's available it's on by default and the redesign kit
 * screen can switch back; other builds keep today's screens until it ships. */
export function redesignEnabled(): boolean {
  return AVAILABLE && storage.getString(KEY) !== "off";
}

export function setRedesignEnabled(enabled: boolean) {
  if (enabled) storage.remove(KEY);
  else storage.set(KEY, "off");
  for (const listener of listeners) listener();
}

export function useRedesign(): boolean {
  return useSyncExternalStore((listener) => { listeners.add(listener); return () => listeners.delete(listener); }, redesignEnabled);
}
