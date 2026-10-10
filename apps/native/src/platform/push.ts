import type { ApiClient } from "@pinkslip/core/api";
import * as Crypto from "expo-crypto";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { storage } from "./storage";

/** Foreground pushes show as banners but never navigate on their own. */
Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
});

export type DevicePushStatus = "enabled" | "promptable" | "denied" | "unsupported";

/** A stable id for this install, so re-registering replaces its old token. */
function installationId(): string {
  let id = storage.getString("installation-id");
  if (!id) {
    id = Crypto.randomUUID();
    storage.set("installation-id", id);
  }
  return id;
}

export async function devicePushStatus(): Promise<DevicePushStatus> {
  if (!Device.isDevice) return "unsupported";
  const { status, canAskAgain } = await Notifications.getPermissionsAsync();
  if (status === "granted") return "enabled";
  return canAskAgain ? "promptable" : "denied";
}

/**
 * Asks for permission when it can, then registers the raw APNs token (what
 * `worker/apns.ts` sends to) under this install's id. Returns the resulting
 * status; "enabled" means the device is registered.
 */
export async function enableDevicePush(api: ApiClient): Promise<DevicePushStatus> {
  if (!Device.isDevice) return "unsupported";
  let { status } = await Notifications.getPermissionsAsync();
  if (status !== "granted") status = (await Notifications.requestPermissionsAsync()).status;
  if (status !== "granted") return "denied";
  const token = await Notifications.getDevicePushTokenAsync();
  await api.push.registerApns(String(token.data), installationId());
  return "enabled";
}

/** Re-registers on launch when permission is already granted, so a rotated
 * APNs token (or a reinstall) keeps receiving alerts. Best effort. */
export async function refreshDevicePush(api: ApiClient): Promise<void> {
  if ((await devicePushStatus()) === "enabled") await enableDevicePush(api).catch(() => undefined);
}

export interface NotificationTarget { url: string | null; jobIds: string[] }

export function notificationTarget(response: Notifications.NotificationResponse): NotificationTarget {
  const data = response.notification.request.content.data as { url?: unknown; job_ids?: unknown } | undefined;
  return {
    url: typeof data?.url === "string" ? data.url : null,
    jobIds: Array.isArray(data?.job_ids) ? data.job_ids.filter((id): id is string => typeof id === "string") : [],
  };
}
