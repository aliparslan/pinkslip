import { useSyncExternalStore } from "react";
import { storage } from "../../platform/storage";

const KEY = "redesign";
const OWNER = "owner-phone";
const listeners = new Set<() => void>();

/** The redesign kit (samples and options being compared) and the owner's
 * update channel: development builds, updates published for the owner with
 * EXPO_PUBLIC_REDESIGN=1, and the owner's own phone whatever build it runs.
 * Once an admin account is seen on a phone, it opens the kit and listens on
 * the owner channel from the next launch (owner, 2026-10-18: test by update
 * alone, with no builds installed from the Mac). Testers never get it. */
export const redesignKitAvailable = __DEV__ || process.env.EXPO_PUBLIC_REDESIGN === "1" || storage.getBoolean(OWNER) === true;

/** Whether the signed-in account is an admin; it takes effect at the next launch. */
export function rememberOwnerPhone(admin: boolean) {
  if (admin) storage.set(OWNER, true);
  else storage.remove(OWNER);
}

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
