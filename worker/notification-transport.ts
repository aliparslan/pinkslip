import {
  isDeadApnsToken,
  resolveApnsConfig,
  sendApnsNotification,
  type ApnsConfig,
} from "./apns";
import {
  sendPushNotification,
  type NotificationPayload,
  type PushResult,
  type VapidConfig,
} from "./push";
import type { Env, PushSubscriptionRow } from "./types";

export interface NotificationTransports {
  apns: ApnsConfig | null;
  vapid: VapidConfig;
}

export function resolveNotificationTransports(env: Env): NotificationTransports {
  return {
    apns: resolveApnsConfig(env),
    vapid: {
      subject: env.VAPID_SUBJECT,
      publicKey: env.VAPID_PUBLIC_KEY,
      privateKey: env.VAPID_PRIVATE_KEY,
    },
  };
}

export async function sendNotificationToSubscription(
  subscription: PushSubscriptionRow,
  payload: NotificationPayload,
  transports: NotificationTransports
): Promise<PushResult> {
  try {
    if (subscription.platform === "ios") {
      if (!transports.apns) {
        return { ok: false, status: 0, error: "APNs is not configured" };
      }
      return await sendApnsNotification(
        subscription.endpoint,
        payload,
        transports.apns
      );
    }

    return await sendPushNotification(
      {
        endpoint: subscription.endpoint,
        keys: {
          p256dh: subscription.p256dh,
          auth: subscription.auth,
        },
      },
      payload,
      transports.vapid
    );
  } catch (error) {
    return {
      ok: false,
      status: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export function isDeadPushSubscription(
  subscription: PushSubscriptionRow,
  result: PushResult
): boolean {
  return subscription.platform === "ios"
    ? isDeadApnsToken(result.status, result.body)
    : result.status === 404 || result.status === 410;
}
