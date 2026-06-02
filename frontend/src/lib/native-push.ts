// Native iOS push (APNs) registration via Capacitor.
//
// On a real browser this is a no-op — Web Push (lib/push.ts) handles those.
// Inside the Capacitor WebView it requests notification permission, registers
// with APNs, ships the device token to the API (reusing the cookie session),
// and deep-links into the hash router when a notification is tapped.

import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import { api } from "./api";
import { navigate } from "../router";

export function isNativeIos(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "ios";
}

/** Routes a tapped notification's payload to the right screen. */
function handleNotificationUrl(data: unknown): void {
  const url = (data as { url?: string } | undefined)?.url;
  if (typeof url === "string" && url.startsWith("/")) {
    navigate(url);
  }
}

let initialized = false;

export async function initNativePush(): Promise<void> {
  if (initialized || !isNativeIos()) return;
  initialized = true;

  // Deliver the APNs device token to the API as soon as registration succeeds.
  await PushNotifications.addListener("registration", (token) => {
    api.push
      .registerApns(token.value)
      .catch((err) => console.error("APNs token registration failed:", err));
  });

  await PushNotifications.addListener("registrationError", (err) => {
    console.error("APNs registration error:", err);
  });

  // Tapping a notification (app backgrounded/closed) deep-links into the app.
  await PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
    handleNotificationUrl(action.notification.data);
  });

  const perm = await PushNotifications.requestPermissions();
  if (perm.receive === "granted") {
    await PushNotifications.register();
  }
}
