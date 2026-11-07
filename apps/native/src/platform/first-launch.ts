import { storage } from "./storage";

/** Whether this phone ran the app before this launch: deleting the app
 * empties its storage. Read when the app starts, before anything this launch
 * writes (the root layout imports onboarding's launch module, which imports
 * this, first). The Keychain is the exception iOS keeps across a reinstall,
 * so the session reads this too (session.ts). */
export const appRanBefore = storage.getAllKeys().length > 0;
