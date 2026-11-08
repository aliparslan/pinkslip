import { storage } from "../../platform/storage";

const OWNER = "owner-phone";

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
