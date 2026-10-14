import * as Updates from "expo-updates";
import { redesignKitAvailable } from "../features/redesign/flag";

/** The over-the-air channel builds made for the owner's phone listen on
 * (EXPO_PUBLIC_REDESIGN=1): its updates carry the redesign kit, so they
 * never reach TestFlight or App Store builds, which stay on `production`.
 * Publish with `bun run update:owner`. The switch applies from the next
 * launch. */
export const OWNER_CHANNEL = "owner";

if (redesignKitAvailable && !__DEV__ && Updates.isEnabled) {
  try {
    Updates.setUpdateRequestHeadersOverride({ "expo-channel-name": OWNER_CHANNEL });
  } catch {
    // An older native build without the override keeps its built-in channel.
  }
}
