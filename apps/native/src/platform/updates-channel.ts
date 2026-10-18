import * as Updates from "expo-updates";
import { redesignKitAvailable } from "../features/redesign/flag";

/** The over-the-air channel the owner's phone listens on (a build made with
 * EXPO_PUBLIC_REDESIGN=1, or any build once an admin account has been seen
 * on it; see `redesignKitAvailable`): its updates carry the redesign kit, so
 * they never reach testers, who stay on `production`. Publish with
 * `bun run update:owner`. The switch applies from the next launch. */
export const OWNER_CHANNEL = "owner";

if (redesignKitAvailable && !__DEV__ && Updates.isEnabled) {
  try {
    Updates.setUpdateRequestHeadersOverride({ "expo-channel-name": OWNER_CHANNEL });
  } catch {
    // An older native build without the override keeps its built-in channel.
  }
}
