import { Hono } from "hono";
import type { Env, PushSubscriptionRow, Variables } from "../types";
import { sendPushNotification } from "../push";
import type { NotificationPayload, VapidConfig } from "../push";
import { resolveApnsConfig, sendApnsNotification } from "../apns";

const push = new Hono<{ Bindings: Env; Variables: Variables }>();

// POST /apns — Register a native iOS APNs device token for the current user.
// The token is stored in the existing push_subscriptions table with
// platform='ios' (device token in `endpoint`, empty p256dh/auth).
push.post("/apns", async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json<{ token: string }>().catch(() => null);
  const token = body?.token?.trim();
  if (!token) {
    return c.json({ error: "Missing device token" }, 400);
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await c.env.DB.prepare(
    `INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth, created_at, platform)
     VALUES (?, ?, ?, '', '', ?, 'ios')
     ON CONFLICT(endpoint) DO UPDATE SET
       user_id = excluded.user_id,
       created_at = excluded.created_at,
       platform = 'ios'`
  )
    .bind(id, userId, token, now)
    .run();

  const created = await c.env.DB.prepare(
    "SELECT * FROM push_subscriptions WHERE endpoint = ?"
  )
    .bind(token)
    .first<PushSubscriptionRow>();

  return c.json(created, 201);
});

// POST /subscribe — Register push subscription
push.post("/subscribe", async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json<{
    endpoint: string;
    keys: { p256dh: string; auth: string };
  }>();

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await c.env.DB.prepare(
    `INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth, created_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(endpoint) DO UPDATE SET
       user_id = excluded.user_id,
       p256dh = excluded.p256dh,
       auth = excluded.auth,
       created_at = excluded.created_at`
  )
    .bind(id, userId, body.endpoint, body.keys.p256dh, body.keys.auth, now)
    .run();

  const created = await c.env.DB.prepare(
    "SELECT * FROM push_subscriptions WHERE endpoint = ?"
  )
    .bind(body.endpoint)
    .first<PushSubscriptionRow>();

  return c.json(created, 201);
});

// DELETE /subscribe — Remove subscription by endpoint
push.delete("/subscribe", async (c) => {
  const body = await c.req.json<{ endpoint: string }>();

  await c.env.DB.prepare(
    "DELETE FROM push_subscriptions WHERE endpoint = ?"
  )
    .bind(body.endpoint)
    .run();

  return c.body(null, 204);
});

push.post("/test", async (c) => {
  const userId = c.get("userId");
  const delay = Math.min(Number(c.req.query("delay") ?? "0"), 10);

  const subsResult = await c.env.DB.prepare(
    "SELECT * FROM push_subscriptions WHERE user_id = ?"
  ).bind(userId).all<PushSubscriptionRow>();
  const subs = subsResult.results ?? [];

  if (subs.length === 0) {
    return c.json({ error: "No push subscriptions registered for this profile. Enable notifications first." }, 400);
  }

  if (delay > 0) {
    await new Promise((resolve) => setTimeout(resolve, delay * 1000));
  }

  const payload: NotificationPayload = {
    title: "pinkslip",
    body: delay > 0 ? `Delayed test (${delay}s) - notifications working!` : "Test notification - everything is working!",
    data: { url: "/" },
  };

  const vapid: VapidConfig = {
    subject: c.env.VAPID_SUBJECT,
    publicKey: c.env.VAPID_PUBLIC_KEY,
    privateKey: c.env.VAPID_PRIVATE_KEY,
  };
  const apnsConfig = resolveApnsConfig(c.env);

  const results: any[] = [];
  for (const sub of subs) {
    let result;
    if (sub.platform === "ios") {
      if (!apnsConfig) {
        result = { ok: false, error: "APNs not configured (set APNS_* env vars)" };
      } else {
        result = await sendApnsNotification(sub.endpoint, payload, apnsConfig);
      }
    } else {
      result = await sendPushNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload,
        vapid
      );
    }
    results.push({
      endpoint: sub.endpoint.slice(0, 60) + "...",
      platform: sub.platform,
      ...result,
    });
  }

  return c.json({ sent: results.filter(r => r.ok).length, total: subs.length, results });
});

export default push;
