import { Hono } from "hono";
import type { Env, PushSubscriptionRow } from "../types";

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

export default push;
