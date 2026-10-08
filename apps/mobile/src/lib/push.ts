/* Job alerts by push. The app registers its APNs token with the server when
   notifications are already allowed (asking happens in You, hidden in this
   build), and a tapped alert opens the job or the feed it points to. */

import * as Application from "expo-application";
import * as Notifications from "expo-notifications";
import { router } from "expo-router";
import { api } from "@pinkslip/core/api";
import { DEMO } from "./demo";
import { appPath } from "./paths";

/** Alerts that arrive while the app is open still show as a banner. */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

export async function refreshPushRegistration(): Promise<void> {
  if (DEMO) return;
  const permission = await Notifications.getPermissionsAsync();
  if (permission.status !== "granted") return;
  const token = await Notifications.getDevicePushTokenAsync();
  const installation = (await Application.getIosIdForVendorAsync()) ?? "unknown-installation";
  await api.push.registerApns(String(token.data), installation);
}

function openFromNotification(response: Notifications.NotificationResponse, onOpen: () => void): void {
  const data = response.notification.request.content.data as { url?: unknown; job_ids?: unknown } | undefined;
  const jobIds = Array.isArray(data?.job_ids) ? data.job_ids.filter((id): id is string => typeof id === "string") : [];
  if (jobIds.length) void api.push.opened(jobIds).catch(() => undefined);
  const path = typeof data?.url === "string" ? appPath(data.url) : null;
  onOpen();
  if (path) router.push(path as never);
}

/** Listen for taps on alerts, including the one that launched the app. */
export function listenForNotifications(onAlert: () => void): () => void {
  if (DEMO) return () => undefined;
  void Notifications.getLastNotificationResponseAsync().then((response) => {
    if (response) openFromNotification(response, onAlert);
  });
  const tapped = Notifications.addNotificationResponseReceivedListener((response) => openFromNotification(response, onAlert));
  const received = Notifications.addNotificationReceivedListener(() => onAlert());
  return () => {
    tapped.remove();
    received.remove();
  };
}
