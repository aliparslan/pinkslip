import { Hono } from "hono";
import { AppleStoreError, decodeJwsPayload, resolveAppleStoreConfig, type AppleEnvironment, type AppleTransaction } from "../apple-store";
import { syncAppleSubscription } from "../plans";
import type { Env, Variables } from "../types";

/** App Store Server Notifications, version 2: Apple posts here when a Pro
 * subscription renews, fails to, is turned off, refunded or ends. The post
 * itself isn't trusted; it only names the subscription, and Pinkslip asks
 * Apple for its real state (worker/apple-store.ts). Anything but a 200 makes
 * Apple try again later, so only a failure to reach Apple answers 500. */
const notifications = new Hono<{ Bindings: Env; Variables: Variables }>();

interface NotificationPayload {
  notificationType?: string;
  subtype?: string;
  data?: { signedTransactionInfo?: string; environment?: AppleEnvironment; bundleId?: string };
}

notifications.post("/", async (c) => {
  const config = resolveAppleStoreConfig(c.env);
  const body = await c.req.json<{ signedPayload?: unknown }>().catch(() => ({} as { signedPayload?: unknown }));
  const payload = typeof body.signedPayload === "string" ? decodeJwsPayload<NotificationPayload>(body.signedPayload) : null;
  if (!payload) return c.json({ error: "Not a notification." }, 400);
  if (!config || payload.notificationType === "TEST") return c.json({ ok: true });
  if (payload.data?.bundleId && payload.data.bundleId !== config.bundleId) return c.json({ ok: true });
  const transaction = payload.data?.signedTransactionInfo ? decodeJwsPayload<AppleTransaction>(payload.data.signedTransactionInfo) : null;
  if (!transaction?.originalTransactionId) return c.json({ ok: true });
  try {
    const result = await syncAppleSubscription(c.env.DB, config, {
      transactionId: transaction.originalTransactionId, prefer: payload.data?.environment,
    });
    if (!result.ok) console.warn("Apple notification not applied:", payload.notificationType, result.code);
    return c.json({ ok: true });
  } catch (error) {
    if (!(error instanceof AppleStoreError)) throw error;
    console.error("Apple notification check failed:", error.message);
    return c.json({ error: "Couldn't reach the App Store." }, 500);
  }
});

export default notifications;
