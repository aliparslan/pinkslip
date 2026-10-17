import { Hono } from "hono";
import type { Env, PushSubscriptionRow, Variables } from "../types";
import { sendPushNotification } from "../push";
import type { NotificationPayload, VapidConfig } from "../push";
import { resolveApnsConfig, sendApnsNotification } from "../apns";
import { recordProductEvent } from "../product-events";
import { markNotificationOpened, requeueNewJobCandidates, setNewJobAlerts } from "../notifications";
import { resolveJobIds } from "../job-identity";

const push = new Hono<{ Bindings: Env; Variables: Variables }>();

push.get("/settings", async (c) => {
  const row = await c.env.DB.prepare(
    `SELECT
       COALESCE(ns.enabled, uns.enabled, usp.notifications_enabled, 0) AS enabled,
       COALESCE(uns.push_enabled, 1) AS push_enabled,
       COALESCE(ns.updated_at, uns.updated_at, usp.updated_at) AS updated_at
     FROM users u
     LEFT JOIN notification_settings ns ON ns.user_id = u.id AND ns.kind = 'new_jobs'
     LEFT JOIN user_notification_settings uns ON uns.user_id = u.id
     LEFT JOIN user_search_profiles usp ON usp.user_id = u.id
     WHERE u.id = ?`
  ).bind(c.get("userId")).first<{
    enabled: number;
    push_enabled: number;
    updated_at: string;
  }>();
  return c.json({
    enabled: row?.enabled === 1,
    push_enabled: row?.push_enabled !== 0,
    updated_at: row?.updated_at ?? null,
    vapid_public_key: c.env.VAPID_PUBLIC_KEY?.trim() || null,
  });
});

/** The job-alert switch for builds before per-kind settings
 * (GET/PATCH /notifications); it writes the same rows. */
push.put("/settings", async (c) => {
  const body = await c.req.json<{ enabled?: boolean; push_enabled?: boolean }>();
  const userId = c.get("userId");
  const existing = await c.env.DB.prepare(
    "SELECT push_enabled FROM user_notification_settings WHERE user_id = ?"
  ).bind(userId).first<{ push_enabled: number }>();
  const pushEnabled = body.push_enabled ?? (existing?.push_enabled !== 0);
  const { enabled } = await setNewJobAlerts(c.env.DB, userId, { enabled: body.enabled });
  await c.env.DB.prepare(
    "UPDATE user_notification_settings SET push_enabled = ? WHERE user_id = ?"
  ).bind(pushEnabled ? 1 : 0, userId).run();
  await requeueNewJobCandidates(c.env.DB, userId, enabled && pushEnabled);
  return c.json({ enabled, push_enabled: pushEnabled });
});

push.post("/opened", async (c) => {
  const body = await c.req.json<{ job_id?: string; job_ids?: string[]; notification_id?: string }>();
  const requestedJobIds = [...new Set([
    ...(Array.isArray(body.job_ids) ? body.job_ids : []),
    ...(body.job_id ? [body.job_id] : []),
  ].filter((jobId) => typeof jobId === "string" && jobId.length > 0))].slice(0, 50);
  const notificationId = typeof body.notification_id === "string" && body.notification_id.length <= 64
    ? body.notification_id
    : null;
  if (requestedJobIds.length === 0 && !notificationId) return c.json({ error: "Missing job id" }, 400);
  const jobIds = [...new Set(await resolveJobIds(c.env.DB, requestedJobIds))];
  await markNotificationOpened(c.env.DB, c.get("userId"), { notificationId, jobIds })
    .catch(() => undefined);
  if (jobIds.length === 0) return c.body(null, 204);
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

// The APNs device token is stored in the existing push_subscriptions table with
// platform='ios' (device token in `endpoint`, empty p256dh/auth).
push.post("/apns", async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json<{
    token: string;
    installation_id?: string;
  }>().catch(() => null);
  const token = body?.token?.trim();
  const installationId = body?.installation_id?.trim() || null;
  if (!token || !/^[a-f0-9]{64,400}$/i.test(token)) {
    return c.json({ error: "Missing device token" }, 400);
  }
  if (installationId && !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(installationId)) {
    return c.json({ error: "Invalid installation identifier" }, 400);
  }
  const owner = await c.env.DB.prepare(
    "SELECT user_id FROM push_subscriptions WHERE endpoint = ?"
  ).bind(token).first<{ user_id: string | null }>();
  if (owner?.user_id && owner.user_id !== userId) {
    return c.json({ error: "This device is already registered to another account" }, 409);
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  const upsert = c.env.DB.prepare(
    `INSERT INTO push_subscriptions (
       id, user_id, endpoint, p256dh, auth, created_at, platform, installation_id
     )
     VALUES (?, ?, ?, '', '', ?, 'ios', ?)
     ON CONFLICT(endpoint) DO UPDATE SET
       user_id = excluded.user_id,
       created_at = excluded.created_at,
       platform = 'ios',
       installation_id = COALESCE(excluded.installation_id, push_subscriptions.installation_id)`
  )
    .bind(id, userId, token, now, installationId);

  if (installationId) {
    // APNs can rotate a token for the same installation. Remove the superseded
    // endpoint before the upsert so delivery continues to fan out to devices,
    // not to historical tokens for the same device.
    await c.env.DB.batch([
      c.env.DB.prepare(
        `DELETE FROM push_subscriptions
         WHERE user_id = ? AND platform = 'ios'
           AND installation_id = ? AND endpoint != ?`
      ).bind(userId, installationId, token),
      upsert,
    ]);
  } else {
    // Compatibility for already-installed clients during the deployment
    // window. New iOS builds always provide the stable installation id.
    await upsert.run();
  }

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
    title: "Pinkslip",
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
