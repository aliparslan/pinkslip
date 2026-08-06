// Native iOS uses APNs. Browsers use the bundled service worker + Web Push.

import { isIosApp, platform } from "./platform";

export function isNativeIos(): boolean {
  return isIosApp();
}

/**
 * On launch: wire listeners and, if notifications are already authorized, register
 * the device token silently. Does NOT prompt — that happens on a user action
 * (the onboarding/settings "Enable" button) via enableNativePush().
 */
export async function initNativePush(): Promise<void> {
  await platform().notifications.initialize();
}

/** Current notification permission as a UI status (no prompt). */
export async function getNativePushStatus(): Promise<"enabled" | "disabled"> {
  return platform().notifications.status();
}

/** User-initiated counterpart to initNativePush: prompts, then registers. */
export async function enableNativePush(): Promise<"enabled" | "denied"> {
  return platform().notifications.enable();
}
