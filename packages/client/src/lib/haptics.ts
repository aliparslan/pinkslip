// Lightweight haptics wrapper. No-op outside the Capacitor native shell (and
// silently swallows errors so a missing Taptic Engine never breaks a flow).
//
// Haptics only fire on a physical device — the iOS simulator produces nothing.

import { platform } from "./platform";

/** A light tick — tab switches, toggles, small confirmations. */
export function hapticLight(): void {
  platform().haptics.light();
}

/** Success buzz — a meaningful task finished (e.g. tailor complete). */
export function hapticSuccess(): void {
  platform().haptics.success();
}
