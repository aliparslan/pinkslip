import { Hono } from "hono";
import type { Env, PushSubscriptionRow } from "../types";
import { sendPushNotification } from "../push";
import type { NotificationPayload, VapidConfig } from "../push";

const push = new Hono<{ Bindings: Env }>();

// POST /subscribe — Register push subscription
push.post("/subscribe", async (c) => {
  const body = await c.req.json<{
    endpoint: string;
    keys: { p256dh: string; auth: string };
  }>();

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await c.env.DB.prepare(
    `INSERT OR REPLACE INTO push_subscriptions (id, endpoint, p256dh, auth, created_at)
     VALUES (?, ?, ?, ?, ?)`
  )
    .bind(id, body.endpoint, body.keys.p256dh, body.keys.auth, now)
    .run();

  const created = await c.env.DB.prepare(
    "SELECT * FROM push_subscriptions WHERE id = ?"
  )
    .bind(id)
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
  const delay = Math.min(Number(c.req.query("delay") ?? "0"), 10);

  const subsResult = await c.env.DB.prepare("SELECT * FROM push_subscriptions").all<PushSubscriptionRow>();
  const subs = subsResult.results ?? [];

  if (subs.length === 0) {
    return c.json({ error: "No push subscriptions registered. Enable notifications first." }, 400);
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

  const results: any[] = [];
  for (const sub of subs) {
    const result = await sendPushNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      payload,
      vapid
    );
    results.push({ endpoint: sub.endpoint.slice(0, 60) + "...", ...result });
  }

  return c.json({ sent: results.filter(r => r.ok).length, total: subs.length, results });
});

export default push;
