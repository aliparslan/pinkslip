// Native iOS uses APNs. Browsers use the bundled service worker + Web Push.

import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import { api } from "./api";
import { navigate } from "../router";

export function isNativeIos(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "ios";
}

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
let serviceWorkerPromise: Promise<ServiceWorkerRegistration> | null = null;
let nativeRegistration: {
  promise: Promise<void>;
  resolve: () => void;
  reject: (error: Error) => void;
} | null = null;

function webPushSupported() {
  return !isNativeIos()
    && "serviceWorker" in navigator
    && "PushManager" in window
    && "Notification" in window;
}

function decodeVapidKey(value: string) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/")
    .padEnd(Math.ceil(value.length / 4) * 4, "=");
  const raw = atob(padded);
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}

function ensureWebServiceWorker() {
  if (!serviceWorkerPromise) {
    serviceWorkerPromise = navigator.serviceWorker.register("/sw.js?v=3");
  }
  return serviceWorkerPromise;
}

async function ensureListeners(): Promise<void> {
  if (listenersReady) return;
  listenersReady = true;

  await PushNotifications.addListener("registration", async (token) => {
    try {
      await api.push.registerApns(token.value);
      nativeRegistration?.resolve();
    } catch (error) {
      const failure = error instanceof Error ? error : new Error("APNs token registration failed");
      nativeRegistration?.reject(failure);
      console.error("APNs token registration failed:", failure);
    }
  });

  await PushNotifications.addListener("registrationError", (err) => {
    nativeRegistration?.reject(new Error(err.error || "APNs registration failed"));
    console.error("APNs registration error:", err);
  });

  // Tapping a notification (app backgrounded/closed) deep-links into the app.
  await PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
    handleNotificationUrl(action.notification.data);
  });
}

async function registerNativeDevice(): Promise<void> {
  if (nativeRegistration) return nativeRegistration.promise;

  let resolveRegistration!: () => void;
  let rejectRegistration!: (error: Error) => void;
  const promise = new Promise<void>((resolve, reject) => {
    resolveRegistration = resolve;
    rejectRegistration = reject;
  });
  const registration = {
    promise,
    resolve: resolveRegistration,
    reject: rejectRegistration,
  };
  nativeRegistration = registration;

  const timeout = window.setTimeout(
    () => registration.reject(new Error("Timed out while registering this device for notifications")),
    15_000
  );
  try {
    await PushNotifications.register();
    await promise;
  } finally {
    window.clearTimeout(timeout);
    if (nativeRegistration === registration) nativeRegistration = null;
  }
}

/**
 * On launch: wire listeners and, if notifications are already authorized, register
 * the device token silently. Does NOT prompt — that happens on a user action
 * (the onboarding/settings "Enable" button) via enableNativePush().
 */
export async function initNativePush(): Promise<void> {
  if (isNativeIos()) {
    await ensureListeners();
    const perm = await PushNotifications.checkPermissions();
    if (perm.receive === "granted") {
      void registerNativeDevice().catch((error) => {
        console.error("APNs refresh registration failed:", error);
      });
    }
    return;
  }
  if (webPushSupported()) {
    await ensureWebServiceWorker();
  }
}

/** Current notification permission as a UI status (no prompt). */
export async function getNativePushStatus(): Promise<"enabled" | "disabled"> {
  if (isNativeIos()) {
    const perm = await PushNotifications.checkPermissions();
    return perm.receive === "granted" ? "enabled" : "disabled";
  }
  if (!webPushSupported() || Notification.permission !== "granted") return "disabled";
  const registration = await ensureWebServiceWorker();
  return await registration.pushManager.getSubscription() ? "enabled" : "disabled";
}

/** User-initiated counterpart to initNativePush: prompts, then registers. */
export async function enableNativePush(): Promise<"enabled" | "denied"> {
  if (isNativeIos()) {
    await ensureListeners();
    const perm = await PushNotifications.requestPermissions();
    if (perm.receive === "granted") {
      await registerNativeDevice();
      return "enabled";
    }
    return "denied";
  }
  if (!webPushSupported()) return "denied";

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return "denied";
  const registration = await ensureWebServiceWorker();
  const settings = await api.push.settings();
  if (!settings.vapid_public_key) {
    throw new Error("Web push is not configured.");
  }
  const subscription = await registration.pushManager.getSubscription()
    ?? await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: decodeVapidKey(settings.vapid_public_key),
    });
  await api.push.subscribe(subscription);
  return "enabled";
}
