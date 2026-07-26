import { Hono } from "hono";
import type { Env, PushSubscriptionRow, Variables } from "../types";
import { sendPushNotification } from "../push";
import type { NotificationPayload, VapidConfig } from "../push";
import { resolveApnsConfig, sendApnsNotification } from "../apns";
import { recordProductEvent } from "../product-events";
import { SCORE_RAW_PER_PERCENT } from "../../shared/scoring";

const push = new Hono<{ Bindings: Env; Variables: Variables }>();

push.get("/settings", async (c) => {
  const row = await c.env.DB.prepare(
    `SELECT
       COALESCE(uns.enabled, usp.notifications_enabled, 0) AS enabled,
       COALESCE(uns.push_enabled, 1) AS push_enabled,
       COALESCE(uns.threshold, usp.match_threshold, 50) AS threshold,
       COALESCE(uns.updated_at, usp.updated_at) AS updated_at
     FROM users u
     LEFT JOIN user_notification_settings uns ON uns.user_id = u.id
     LEFT JOIN user_search_profiles usp ON usp.user_id = u.id
     WHERE u.id = ?`
  ).bind(c.get("userId")).first<{
    enabled: number;
    push_enabled: number;
    threshold: number;
    updated_at: string;
  }>();
  return c.json({
    enabled: row?.enabled === 1,
    push_enabled: row?.push_enabled !== 0,
    threshold: row?.threshold ?? 50,
    updated_at: row?.updated_at ?? null,
    vapid_public_key: c.env.VAPID_PUBLIC_KEY?.trim() || null,
  });
});

push.put("/settings", async (c) => {
  const body = await c.req.json<{ enabled?: boolean; push_enabled?: boolean; threshold?: number }>();
  const existing = await c.env.DB.prepare(
    "SELECT enabled, push_enabled, threshold FROM user_notification_settings WHERE user_id = ?"
  ).bind(c.get("userId")).first<{ enabled: number; push_enabled: number; threshold: number }>();
  const enabled = body.enabled ?? (existing?.enabled === 1);
  const pushEnabled = body.push_enabled ?? (existing?.push_enabled !== 0);
  const threshold = Number.isFinite(Number(body.threshold))
    ? Math.max(0, Math.min(100, Math.round(Number(body.threshold))))
    : existing?.threshold ?? 50;
  await c.env.DB.prepare(
    `INSERT INTO user_notification_settings (user_id, enabled, push_enabled, threshold, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       enabled = excluded.enabled,
       push_enabled = excluded.push_enabled,
       threshold = excluded.threshold,
       updated_at = excluded.updated_at`
  ).bind(
    c.get("userId"),
    enabled ? 1 : 0,
    pushEnabled ? 1 : 0,
    threshold,
    new Date().toISOString()
  ).run();
  await c.env.DB.prepare(
    "UPDATE user_search_profiles SET notifications_enabled = ?, updated_at = ? WHERE user_id = ?"
  ).bind(enabled ? 1 : 0, new Date().toISOString(), c.get("userId")).run();
  await c.env.DB.prepare(
    `UPDATE notification_candidates
     SET status = 'skipped', last_error = 'Notification settings changed'
     WHERE user_id = ?
       AND status IN ('pending', 'retry')
       AND (? = 0 OR ? = 0 OR score < CAST(ROUND(? * ${SCORE_RAW_PER_PERCENT}) AS INTEGER))`
  ).bind(
    c.get("userId"),
    enabled ? 1 : 0,
    pushEnabled ? 1 : 0,
    threshold
  ).run();
  if (enabled && pushEnabled) {
    await c.env.DB.prepare(
      `UPDATE notification_candidates
       SET status = 'retry', attempt_count = 0, last_error = NULL
       WHERE user_id = ?
         AND status IN ('failed', 'skipped')
         AND score >= CAST(ROUND(? * ${SCORE_RAW_PER_PERCENT}) AS INTEGER)`
    ).bind(c.get("userId"), threshold).run();
    await c.env.DB.prepare(
      `UPDATE notification_deliveries
       SET status = 'retry', attempt_count = 0, last_error = NULL
       WHERE candidate_id IN (
         SELECT id FROM notification_candidates
         WHERE user_id = ? AND status = 'retry'
       )
         AND status = 'failed'`
    ).bind(c.get("userId")).run();
  }
  return c.json({ enabled, push_enabled: pushEnabled, threshold });
});

push.post("/opened", async (c) => {
  const body = await c.req.json<{ job_id?: string; job_ids?: string[] }>();
  const jobIds = [...new Set([
    ...(Array.isArray(body.job_ids) ? body.job_ids : []),
    ...(body.job_id ? [body.job_id] : []),
  ].filter((jobId) => typeof jobId === "string" && jobId.length > 0))].slice(0, 50);
  if (jobIds.length === 0) return c.json({ error: "Missing job id" }, 400);
  const openedAt = new Date().toISOString();
  const updates = await c.env.DB.batch(jobIds.map((jobId) =>
    c.env.DB.prepare(
      `UPDATE notification_candidates
       SET opened_at = ?
       WHERE user_id = ? AND job_id = ? AND status = 'sent' AND opened_at IS NULL`
    ).bind(openedAt, c.get("userId"), jobId)
  ));
  const newlyOpened = jobIds.filter((_, index) => (updates[index].meta.changes ?? 0) > 0);
  await Promise.all(newlyOpened.map((jobId) =>
    recordProductEvent(c.env.DB, {
      userId: c.get("userId"),
      sessionId: c.get("sessionId"),
      name: "notification_opened",
      entityType: "job",
      entityId: jobId,
    }).catch(() => undefined)
  ));
  return c.body(null, 204);
});

// POST /apns — Register a native iOS APNs device token for the current user.
// The token is stored in the existing push_subscriptions table with
// platform='ios' (device token in `endpoint`, empty p256dh/auth).
push.post("/apns", async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json<{ token: string }>().catch(() => null);
  const token = body?.token?.trim();
  if (!token || !/^[a-f0-9]{64,400}$/i.test(token)) {
    return c.json({ error: "Missing device token" }, 400);
  }
  const owner = await c.env.DB.prepare(
    "SELECT user_id FROM push_subscriptions WHERE endpoint = ?"
  ).bind(token).first<{ user_id: string | null }>();
  if (owner?.user_id && owner.user_id !== userId) {
    return c.json({ error: "This device is already registered to another account" }, 409);
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

  if (!owner) {
    await recordProductEvent(c.env.DB, {
      userId,
      sessionId: c.get("sessionId"),
      name: "push_registered",
      entityType: "push_subscription",
      entityId: created?.id ?? id,
      properties: { platform: "ios" },
    }).catch(() => undefined);
  }

  return c.json(created, 201);
});

// POST /subscribe — Register push subscription
push.post("/subscribe", async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json<{
    endpoint: string;
    keys: { p256dh: string; auth: string };
  }>().catch(() => null);
  const endpoint = body?.endpoint?.trim();
  if (!endpoint || !endpoint.startsWith("https://") || !body?.keys?.p256dh || !body.keys.auth) {
    return c.json({ error: "Invalid push subscription" }, 400);
  }
  const owner = await c.env.DB.prepare(
    "SELECT user_id FROM push_subscriptions WHERE endpoint = ?"
  ).bind(endpoint).first<{ user_id: string | null }>();
  if (owner?.user_id && owner.user_id !== userId) {
    return c.json({ error: "This browser is already registered to another account" }, 409);
  }

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
    .bind(id, userId, endpoint, body.keys.p256dh.slice(0, 500), body.keys.auth.slice(0, 500), now)
    .run();

  const created = await c.env.DB.prepare(
    "SELECT * FROM push_subscriptions WHERE endpoint = ?"
  )
    .bind(endpoint)
    .first<PushSubscriptionRow>();

  if (!owner) {
    await recordProductEvent(c.env.DB, {
      userId,
      sessionId: c.get("sessionId"),
      name: "push_registered",
      entityType: "push_subscription",
      entityId: created?.id ?? id,
      properties: { platform: "web" },
    }).catch(() => undefined);
  }

  return c.json(created, 201);
});

// DELETE /subscribe — Remove subscription by endpoint
push.delete("/subscribe", async (c) => {
  const body = await c.req.json<{ endpoint?: string }>().catch(() => null);
  const endpoint = body?.endpoint?.trim();
  if (!endpoint) return c.json({ error: "Missing push endpoint" }, 400);

  await c.env.DB.prepare(
    "DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?"
  )
    .bind(endpoint, c.get("userId"))
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
