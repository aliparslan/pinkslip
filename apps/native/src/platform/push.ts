import { APPLY_ASK_CATEGORY, type ApiClient } from "@pinkslip/core/api";
import * as Crypto from "expo-crypto";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Linking } from "react-native";
import { ALERT_HIDE, ALERT_QUEUE, ALERT_SAVE } from "@pinkslip/domain/job-alerts";
import { configureAlertActions } from "../../modules/alert-actions";
import { API_URL } from "./config";
import { storage } from "./storage";

/** Foreground pushes show as banners but never navigate on their own. */
Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
});

/** The "Apply for you?" push's buttons, shown on press and hold (owner,
 * 2026-10-29, Paper "Apply for you? push · Oct 29"). Apply opens Pinkslip on
 * the job and starts the send; Not this one only clears the push, so it
 * leaves the app closed. */
export const ASK_APPLY = "apply";
export const ASK_DISMISS = "dismiss";
void Notifications.setNotificationCategoryAsync(APPLY_ASK_CATEGORY, [
  { identifier: ASK_APPLY, buttonTitle: "Apply", options: { opensAppToForeground: true } },
  { identifier: ASK_DISMISS, buttonTitle: "Not this one", options: { opensAppToForeground: false } },
]).catch(() => undefined);

/** A one-job alert's buttons (owner, 2026-11-08) act where the alert is,
 * leaving the app closed: iOS runs no JavaScript for a button press, so
 * modules/alert-actions registers them and calls the API. */
configureAlertActions(API_URL);

/** Buttons the native handler has already run, so a tap isn't opened too. */
export function isAlertButton(action: string): boolean {
  return action === ALERT_SAVE || action === ALERT_QUEUE || action === ALERT_HIDE;
}

export type DevicePushStatus = "enabled" | "promptable" | "denied" | "unsupported";

/** Opens Pinkslip's Notifications page in Settings (iOS's
 * `openNotificationSettingsURLString`), not the list of apps the plain
 * settings link lands on (owner, 2026-11-07). */
export async function openNotificationSettings(): Promise<void> {
  try {
    await Linking.openURL("app-settings:notifications");
  } catch {
    await Linking.openSettings();
  }
}

/** The app icon's number: what needs you on Today. Pushes carry the same
 * count from the server; this keeps it right after you act in the app. */
export function setAppBadge(count: number): void {
  void Notifications.setBadgeCountAsync(count).catch(() => undefined);
}

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

export interface NotificationTarget { url: string | null; jobIds: string[]; notificationId: string | null }

/** Where the alert that started the app goes, if one did. */
export function launchNotificationUrl(): string | null {
  const response = Notifications.getLastNotificationResponse();
  return response ? notificationTarget(response).url : null;
}

/** Where a tapped alert goes. A remote push's `data` is its payload's
 * `body` key; pushes sent before it carried one have the link at the top of
 * the payload, which the trigger holds. */
export function notificationTarget(response: Notifications.NotificationResponse): NotificationTarget {
  type Target = { url?: unknown; job_ids?: unknown; notification_id?: unknown };
  const request = response.notification.request;
  const trigger = request.trigger as { payload?: Target | null } | null;
  const content = request.content.data as Target | null | undefined;
  const data = content && typeof content.url === "string" ? content : trigger?.payload ?? content ?? undefined;
  return {
    url: typeof data?.url === "string" ? data.url : null,
    jobIds: Array.isArray(data?.job_ids) ? data.job_ids.filter((id): id is string => typeof id === "string") : [],
    notificationId: typeof data?.notification_id === "string" ? data.notification_id : null,
  };
}
