// Lightweight haptics wrapper. No-op outside the Capacitor native shell (and
// silently swallows errors so a missing Taptic Engine never breaks a flow).
//
// Haptics only fire on a physical device — the iOS simulator produces nothing.

import { Capacitor } from "@capacitor/core";
import { Haptics, ImpactStyle, NotificationType } from "@capacitor/haptics";

const enabled = Capacitor.isNativePlatform();

/** A light tick — tab switches, toggles, small confirmations. */
export function hapticLight(): void {
  if (!enabled) return;
  Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
}

/** Success buzz — a meaningful task finished (e.g. tailor complete). */
export function hapticSuccess(): void {
  if (!enabled) return;
  Haptics.notification({ type: NotificationType.Success }).catch(() => {});
}
