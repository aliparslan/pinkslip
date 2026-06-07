// Native iOS push (APNs) registration via Capacitor.
//
// No-op outside the Capacitor iOS shell. Inside it: requests notification
// permission, registers with APNs, ships the device token to the API (reusing
// the cookie session), and deep-links into the hash router on notification tap.

import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import { api } from "./api";
import { navigate } from "../router";

export function isNativeIos(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "ios";
}

/** Routes a tapped notification's payload to the right screen. */
function handleNotificationUrl(data: unknown): void {
  const payload = data as { url?: string; job_ids?: unknown } | undefined;
  const jobIds = Array.isArray(payload?.job_ids)
    ? payload.job_ids.filter((jobId): jobId is string => typeof jobId === "string")
    : [];
  if (jobIds.length > 0) {
    void api.push.opened(jobIds).catch(() => undefined);
  }
  const url = payload?.url;
  if (typeof url === "string" && url.startsWith("/")) {
    navigate(url);
  }
}

let listenersReady = false;

async function ensureListeners(): Promise<void> {
  if (listenersReady) return;
  listenersReady = true;

  // Deliver the APNs device token to the API as soon as registration succeeds.
  await PushNotifications.addListener("registration", (token) => {
    api.push
      .registerApns(token.value)
      .catch((err) => {
        console.error("APNs token registration failed:", err);
      });
  });

  await PushNotifications.addListener("registrationError", (err) => {
    console.error("APNs registration error:", err);
  });

  // Tapping a notification (app backgrounded/closed) deep-links into the app.
  await PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
    handleNotificationUrl(action.notification.data);
  });
}

/**
 * On launch: wire listeners and, if notifications are already authorized, register
 * the device token silently. Does NOT prompt — that happens on a user action
 * (the onboarding/settings "Enable" button) via enableNativePush().
 */
export async function initNativePush(): Promise<void> {
  if (!isNativeIos()) return;
  await ensureListeners();
  const perm = await PushNotifications.checkPermissions();
  if (perm.receive === "granted") {
    await PushNotifications.register();
  }
}

/** Current notification permission as a UI status (no prompt). */
export async function getNativePushStatus(): Promise<"enabled" | "disabled"> {
  if (!isNativeIos()) return "disabled";
  const perm = await PushNotifications.checkPermissions();
  return perm.receive === "granted" ? "enabled" : "disabled";
}

/**
 * User-initiated: request notification permission, then register for APNs.
 * Returns the resulting status for the UI.
 */
export async function enableNativePush(): Promise<"enabled" | "denied"> {
  if (!isNativeIos()) return "denied";
  await ensureListeners();
  const perm = await PushNotifications.requestPermissions();
  if (perm.receive === "granted") {
    await PushNotifications.register();
    return "enabled";
  }
  return "denied";
}
