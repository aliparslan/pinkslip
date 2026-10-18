// The notifications foundation (docs/backend-inventory-2026-10-16.md, step 2):
// settings per kind, the person's time zone, the log that also schedules
// timed sends, the daily cap on passive pushes, and delivery on the
// every-minute tick. New-job alerts keep their own matcher and candidate
// tables (notification-delivery.ts) but write here as they go out.

import { MAX_POSTED_AGE_DAYS } from "../shared/job-policy";
import { needsYouCount } from "./activity";
import { DEFAULT_TIME_ZONE, isTimeZone, localDate, localParts, validTimeZone } from "./local-time";
import {
  DEFAULT_DAILY_TIME,
  groupable,
  groupedNotification,
  isNotificationKind,
  LIVE_KINDS,
  NOTIFICATION_KINDS,
  PASSIVE_PER_DAY,
  PASSIVE_SPACING_MS,
  PASSIVE_WINDOW_MS,
  type LoggedNotification,
  type NotificationKind,
} from "./notification-kinds";
import {
  isDeadPushSubscription,
  resolveNotificationTransports,
  sendNotificationToSubscription,
  type NotificationTransports,
} from "./notification-transport";
import type { NotificationPayload } from "./push";
import type { Env, PushSubscriptionRow } from "./types";
import { MATCHER_VERSION } from "./user-job-matches";

// ─── Settings ────────────────────────────────────────────────────────────────

export type NewJobsMode = "post" | "daily";

export interface KindSetting {
  enabled: boolean;
}

export interface NewJobsSetting extends KindSetting {
  mode: NewJobsMode;
  /** Local "HH:MM" for once a day. */
  daily_time: string;
}

export interface NotificationSettings {
  time_zone: string | null;
  /** Live kinds only: what the apps can offer today. */
  kinds: { new_jobs: NewJobsSetting } & Partial<Record<Exclude<NotificationKind, "new_jobs">, KindSetting>>;
  /** Passive pushes in any 24 hours. */
  passive_per_day: number;
}

interface SettingRow {
  kind: string;
  enabled: number;
  mode: string | null;
  daily_time: string | null;
}

const DAILY_TIME = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export async function loadNotificationSettings(db: D1Database, userId: string): Promise<NotificationSettings> {
  const [rows, user, legacy] = await Promise.all([
    db.prepare("SELECT kind, enabled, mode, daily_time FROM notification_settings WHERE user_id = ?")
      .bind(userId).all<SettingRow>(),
    db.prepare("SELECT time_zone FROM users WHERE id = ?").bind(userId).first<{ time_zone: string | null }>(),
    db.prepare(
      `SELECT COALESCE(uns.enabled, usp.notifications_enabled, 0) AS enabled
       FROM users u
       LEFT JOIN user_notification_settings uns ON uns.user_id = u.id
       LEFT JOIN user_search_profiles usp ON usp.user_id = u.id
       WHERE u.id = ?`
    ).bind(userId).first<{ enabled: number }>(),
  ]);
  const byKind = new Map((rows.results ?? []).map((row) => [row.kind, row]));
  const newJobs = byKind.get("new_jobs");
  const kinds: NotificationSettings["kinds"] = {
    new_jobs: {
      enabled: newJobs ? newJobs.enabled === 1 : legacy?.enabled === 1,
      mode: newJobs?.mode === "daily" ? "daily" : "post",
      daily_time: newJobs?.daily_time && DAILY_TIME.test(newJobs.daily_time) ? newJobs.daily_time : DEFAULT_DAILY_TIME,
    },
  };
  for (const kind of LIVE_KINDS) {
    if (kind === "new_jobs") continue;
    const row = byKind.get(kind);
    kinds[kind] = { enabled: row ? row.enabled === 1 : NOTIFICATION_KINDS[kind].defaultOn };
  }
  return { time_zone: user?.time_zone ?? null, kinds, passive_per_day: PASSIVE_PER_DAY };
}

/** Whether a person gets this kind right now. */
export async function kindEnabled(db: D1Database, userId: string, kind: NotificationKind): Promise<boolean> {
  if (kind === "new_jobs") return (await loadNotificationSettings(db, userId)).kinds.new_jobs.enabled;
  const row = await db.prepare("SELECT enabled FROM notification_settings WHERE user_id = ? AND kind = ?")
    .bind(userId, kind).first<{ enabled: number }>();
  return row ? row.enabled === 1 : NOTIFICATION_KINDS[kind].defaultOn;
}

/**
 * The one way the job-alert switch changes. It writes the new row and the two
 * older copies that TestFlight builds still read, then lines up or drops the
 * alerts already queued for that person.
 */
export async function setNewJobAlerts(
  db: D1Database,
  userId: string,
  change: { enabled?: boolean; mode?: NewJobsMode; dailyTime?: string },
  now = new Date()
): Promise<NewJobsSetting> {
  const current = (await loadNotificationSettings(db, userId)).kinds.new_jobs;
  const next: NewJobsSetting = {
    enabled: change.enabled ?? current.enabled,
    mode: change.mode ?? current.mode,
    daily_time: change.dailyTime ?? current.daily_time,
  };
  const at = now.toISOString();
  await db.batch([
    db.prepare(
      `INSERT INTO notification_settings (user_id, kind, enabled, mode, daily_time, updated_at)
       VALUES (?, 'new_jobs', ?, ?, ?, ?)
       ON CONFLICT(user_id, kind) DO UPDATE SET
         enabled = excluded.enabled, mode = excluded.mode,
         daily_time = excluded.daily_time, updated_at = excluded.updated_at`
    ).bind(userId, next.enabled ? 1 : 0, next.mode, next.daily_time, at),
    db.prepare(
      `INSERT INTO user_notification_settings (user_id, enabled, push_enabled, updated_at)
       VALUES (?, ?, 1, ?)
       ON CONFLICT(user_id) DO UPDATE SET enabled = excluded.enabled, updated_at = excluded.updated_at`
    ).bind(userId, next.enabled ? 1 : 0, at),
    db.prepare("UPDATE user_search_profiles SET notifications_enabled = ?, updated_at = ? WHERE user_id = ?")
      .bind(next.enabled ? 1 : 0, at, userId),
  ]);
  if (next.enabled !== current.enabled) await requeueNewJobCandidates(db, userId, next.enabled);
  return next;
}

/** Turning alerts off drops what's queued; turning them on revives matches still worth sending. */
export async function requeueNewJobCandidates(db: D1Database, userId: string, enabled: boolean) {
  if (!enabled) {
    await db.prepare(
      `UPDATE notification_candidates
       SET status = 'skipped', last_error = 'Notification settings changed'
       WHERE user_id = ? AND status IN ('pending', 'retry')`
    ).bind(userId).run();
    return;
  }
  await db.prepare(
    `UPDATE notification_candidates
     SET status = 'retry', attempt_count = 0, last_error = NULL
     WHERE user_id = ?
       AND status IN ('failed', 'skipped')
       AND EXISTS (
         SELECT 1
         FROM user_job_matches ujm
         JOIN jobs j ON j.id = ujm.job_id
         WHERE ujm.user_id = notification_candidates.user_id
           AND ujm.job_id = notification_candidates.job_id
           AND ujm.matcher_version = ?
           AND j.closed_at IS NULL
           AND j.description IS NOT NULL
           AND trim(j.description) != ''
           AND (j.posted_at IS NULL OR datetime(j.posted_at) > datetime('now', '-${MAX_POSTED_AGE_DAYS + 1} days'))
       )`
  ).bind(userId, MATCHER_VERSION).run();
  await db.prepare(
    `UPDATE notification_deliveries
     SET status = 'retry', attempt_count = 0, last_error = NULL
     WHERE candidate_id IN (
       SELECT id FROM notification_candidates
       WHERE user_id = ? AND status = 'retry'
     )
       AND status = 'failed'`
  ).bind(userId).run();
}

export class SettingsError extends Error {}

export interface SettingsInput {
  time_zone?: unknown;
  kinds?: Record<string, unknown>;
}

export async function saveNotificationSettings(
  db: D1Database,
  userId: string,
  input: SettingsInput,
  now = new Date()
): Promise<NotificationSettings> {
  if (input.time_zone !== undefined) {
    if (!isTimeZone(input.time_zone)) throw new SettingsError("Unknown time zone");
    await db.prepare("UPDATE users SET time_zone = ? WHERE id = ?").bind(input.time_zone, userId).run();
  }
  for (const [kind, raw] of Object.entries(input.kinds ?? {})) {
    if (!isNotificationKind(kind)) throw new SettingsError(`Unknown kind: ${kind}`);
    const value = (raw ?? {}) as { enabled?: unknown; mode?: unknown; daily_time?: unknown };
    if (value.enabled !== undefined && typeof value.enabled !== "boolean") throw new SettingsError("enabled must be true or false");
    if (kind === "new_jobs") {
      if (value.mode !== undefined && value.mode !== "post" && value.mode !== "daily") throw new SettingsError("mode must be post or daily");
      if (value.daily_time !== undefined && (typeof value.daily_time !== "string" || !DAILY_TIME.test(value.daily_time))) {
        throw new SettingsError("daily_time must be HH:MM");
      }
      await setNewJobAlerts(db, userId, {
        enabled: value.enabled as boolean | undefined,
        mode: value.mode as NewJobsMode | undefined,
        dailyTime: value.daily_time as string | undefined,
      }, now);
      continue;
    }
    if (value.enabled === undefined) continue;
    await db.prepare(
      `INSERT INTO notification_settings (user_id, kind, enabled, mode, daily_time, updated_at)
       VALUES (?, ?, ?, NULL, NULL, ?)
       ON CONFLICT(user_id, kind) DO UPDATE SET enabled = excluded.enabled, updated_at = excluded.updated_at`
    ).bind(userId, kind, value.enabled ? 1 : 0, now.toISOString()).run();
    if (!value.enabled) {
      await db.prepare(
        `UPDATE notification_log SET status = 'skipped', error = 'Turned off'
         WHERE user_id = ? AND kind = ? AND status = 'scheduled'`
      ).bind(userId, kind).run();
    }
  }
  return loadNotificationSettings(db, userId);
}

// ─── The log and the scheduler ───────────────────────────────────────────────

export interface ScheduleInput {
  userId: string;
  kind: NotificationKind;
  /** The same person and key are only ever notified once. */
  dedupeKey: string;
  title: string;
  body: string;
  url: string;
  entityType?: string | null;
  entityId?: string | null;
  /** Defaults to now: sent on the next tick. */
  scheduledFor?: Date;
  /** Defaults to the kind's. */
  timeSensitive?: boolean;
}

/** Queues a notification. Returns false when that key was already used. */
export async function scheduleNotification(db: D1Database, input: ScheduleInput, now = new Date()): Promise<boolean> {
  const timeSensitive = input.timeSensitive ?? NOTIFICATION_KINDS[input.kind].timeSensitive;
  const result = await db.prepare(
    `INSERT OR IGNORE INTO notification_log (
       id, user_id, kind, dedupe_key, title, body, url, entity_type, entity_id,
       passive, status, scheduled_for, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'scheduled', ?, ?)`
  ).bind(
    crypto.randomUUID(),
    input.userId,
    input.kind,
    input.dedupeKey.slice(0, 200),
    input.title.slice(0, 200),
    input.body.slice(0, 500),
    input.url.slice(0, 500),
    input.entityType ?? null,
    input.entityId ?? null,
    timeSensitive ? 0 : 1,
    (input.scheduledFor ?? now).toISOString(),
    now.toISOString()
  ).run();
  return (result.meta?.changes ?? 0) > 0;
}

/** Writes a notification that went out without being scheduled (new-job alerts). */
export async function recordSentNotification(
  db: D1Database,
  row: {
    id: string;
    userId: string;
    kind: NotificationKind;
    dedupeKey: string;
    payload: NotificationPayload;
    entityType?: string | null;
    entityId?: string | null;
    devices: number;
    sentAt: Date;
  }
): Promise<void> {
  const at = row.sentAt.toISOString();
  await db.prepare(
    `INSERT INTO notification_log (
       id, user_id, kind, dedupe_key, title, body, url, entity_type, entity_id,
       passive, status, scheduled_for, attempt_count, devices, created_at, sent_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'sent', ?, 1, ?, ?, ?)
     ON CONFLICT(user_id, dedupe_key) DO UPDATE SET
       status = 'sent', devices = excluded.devices, sent_at = excluded.sent_at,
       title = excluded.title, body = excluded.body, url = excluded.url`
  ).bind(
    row.id,
    row.userId,
    row.kind,
    row.dedupeKey,
    row.payload.title.slice(0, 200),
    row.payload.body.slice(0, 500),
    row.payload.data.url.slice(0, 500),
    row.entityType ?? null,
    row.entityId ?? null,
    NOTIFICATION_KINDS[row.kind].timeSensitive ? 0 : 1,
    at,
    row.devices,
    at,
    at
  ).run();
}

/** Passive notifications sent in the last 24 hours at or above which a person waits. */
export function passiveWindowStart(now: Date): string {
  return new Date(now.getTime() - PASSIVE_WINDOW_MS).toISOString();
}

/**
 * People who can't get a passive push right now: three in the last 24 hours,
 * or one in the last 4. Bind `cappedUsersBindings(now)`.
 */
export const CAPPED_USERS_SQL = `SELECT user_id FROM notification_log
  WHERE passive = 1 AND status = 'sent' AND sent_at > ?
  GROUP BY user_id HAVING COUNT(*) >= ${PASSIVE_PER_DAY} OR MAX(sent_at) > ?`;

export function cappedUsersBindings(now: Date): [string, string] {
  return [passiveWindowStart(now), new Date(now.getTime() - PASSIVE_SPACING_MS).toISOString()];
}

/**
 * When a person may get their next passive push: null when they can now,
 * else the later of 4 hours after their last one and the moment the oldest
 * of their last three leaves the 24 hours.
 */
export async function passiveCapFreesAt(db: D1Database, userId: string, now: Date): Promise<Date | null> {
  const rows = await db.prepare(
    `SELECT sent_at FROM notification_log
     WHERE user_id = ? AND passive = 1 AND status = 'sent' AND sent_at > ?
     ORDER BY sent_at DESC
     LIMIT ?`
  ).bind(userId, passiveWindowStart(now), PASSIVE_PER_DAY).all<{ sent_at: string }>();
  const sent = (rows.results ?? []).map((row) => Date.parse(row.sent_at));
  const waits: number[] = [];
  if (sent.length > 0) waits.push(sent[0]! + PASSIVE_SPACING_MS);
  if (sent.length >= PASSIVE_PER_DAY) waits.push(sent.at(-1)! + PASSIVE_WINDOW_MS);
  const freesAt = Math.max(0, ...waits);
  return freesAt > now.getTime() ? new Date(freesAt) : null;
}

export interface UserSendResult {
  /** Devices that accepted it. */
  devices: number;
  /** Devices tried. */
  total: number;
  error: string | null;
}

/**
 * Sends one payload to every device a person has, removing tokens the push
 * service says are dead. Respects the account-wide "don't push me" switch.
 */
export async function sendToUser(
  db: D1Database,
  userId: string,
  payload: NotificationPayload,
  transports: NotificationTransports,
  send: typeof sendNotificationToSubscription = sendNotificationToSubscription
): Promise<UserSendResult> {
  const subscriptions = await db.prepare(
    `SELECT ps.*
     FROM push_subscriptions ps
     LEFT JOIN user_notification_settings uns ON uns.user_id = ps.user_id
     WHERE ps.user_id = ? AND COALESCE(uns.push_enabled, 1) = 1`
  ).bind(userId).all<PushSubscriptionRow>();
  const subs = subscriptions.results ?? [];
  let devices = 0;
  let error: string | null = null;
  for (const subscription of subs) {
    const result = await send(subscription, payload, transports);
    if (result.ok) {
      devices += 1;
      continue;
    }
    error = (result.error ?? `Push service returned ${result.status ?? 0}${result.body ? ` ${result.body}` : ""}`).slice(0, 500);
    if (isDeadPushSubscription(subscription, result)) {
      await db.prepare("DELETE FROM push_subscriptions WHERE id = ?").bind(subscription.id).run();
    }
  }
  return { devices, total: subs.length, error };
}

interface DueRow extends LoggedNotification {
  user_id: string;
  passive: number;
  attempt_count: number;
}

const DELIVERY_BATCH = 100;
const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 5 * 60 * 1000;
const CLAIM_EXPIRY_MS = 10 * 60 * 1000;

export interface DeliveryStats {
  sent: number;
  held: number;
  skipped: number;
  failed: number;
}

/**
 * Runs on the every-minute tick: sends every scheduled notification that's
 * due. Same-kind notifications for one person go as one push where the kind
 * groups; passive ones wait while the person is at the daily cap.
 */
export async function deliverDueNotifications(
  env: Env,
  now = new Date(),
  send: typeof sendNotificationToSubscription = sendNotificationToSubscription
): Promise<DeliveryStats> {
  const db = env.DB;
  const at = now.toISOString();
  const stats: DeliveryStats = { sent: 0, held: 0, skipped: 0, failed: 0 };

  // A run that died mid-send leaves rows 'sending'; put them back. A daily
  // new-jobs claim has no text of its own (its jobs wait in the candidates
  // table), so it's closed instead and the jobs go in tomorrow's.
  await db.prepare(
    `UPDATE notification_log
     SET status = CASE WHEN attempt_count >= ? OR kind = 'new_jobs' THEN 'failed' ELSE 'scheduled' END,
         error = COALESCE(error, 'Delivery claim expired')
     WHERE status = 'sending' AND scheduled_for < ?`
  ).bind(MAX_ATTEMPTS, new Date(now.getTime() - CLAIM_EXPIRY_MS).toISOString()).run();

  const claimed = await db.prepare(
    // scheduled_for becomes the claim time, so the reaper above only resets
    // rows whose send really died.
    `UPDATE notification_log
     SET status = 'sending', attempt_count = attempt_count + 1, scheduled_for = ?
     WHERE id IN (
       SELECT id FROM notification_log
       WHERE status = 'scheduled' AND scheduled_for <= ? AND kind != 'new_jobs'
       ORDER BY scheduled_for ASC
       LIMIT ?
     )
     RETURNING id, user_id, kind, title, body, url, entity_id, passive, attempt_count, created_at`
  ).bind(at, at, DELIVERY_BATCH).all<DueRow & { created_at: string }>();
  const rows = (claimed.results ?? []).sort((a, b) => a.created_at.localeCompare(b.created_at));
  if (rows.length === 0) return stats;

  const transports = resolveNotificationTransports(env);
  const byUser = new Map<string, DueRow[]>();
  for (const row of rows) byUser.set(row.user_id, [...(byUser.get(row.user_id) ?? []), row]);

  const finish = async (group: DueRow[], status: "sent" | "skipped" | "failed", fields: { devices?: number; error?: string | null }) => {
    await db.batch(group.map((row) => db.prepare(
      `UPDATE notification_log
       SET status = ?, devices = ?, error = ?, sent_at = CASE WHEN ? = 'sent' THEN ? ELSE sent_at END
       WHERE id = ?`
    ).bind(status, fields.devices ?? 0, fields.error ?? null, status, at, row.id)));
  };
  const reschedule = async (group: DueRow[], when: Date, error: string | null, countsAsAttempt: boolean) => {
    await db.batch(group.map((row) => db.prepare(
      `UPDATE notification_log
       SET status = 'scheduled', scheduled_for = ?, error = ?,
           attempt_count = attempt_count - ?
       WHERE id = ?`
    ).bind(when.toISOString(), error, countsAsAttempt ? 0 : 1, row.id)));
  };

  for (const [userId, userRows] of byUser) {
    const groups: DueRow[][] = [];
    const byKind = new Map<string, DueRow[]>();
    for (const row of userRows) {
      if (groupable(row.kind)) {
        const existing = byKind.get(row.kind);
        if (existing) existing.push(row);
        else {
          const group = [row];
          byKind.set(row.kind, group);
          groups.push(group);
        }
      } else {
        groups.push([row]);
      }
    }

    for (const group of groups) {
      const kind = group[0]!.kind;
      if (!NOTIFICATION_KINDS[kind] || !(await kindEnabled(db, userId, kind))) {
        await finish(group, "skipped", { error: "Turned off" });
        stats.skipped += group.length;
        continue;
      }
      if (group[0]!.passive === 1) {
        const freesAt = await passiveCapFreesAt(db, userId, now);
        if (freesAt) {
          await reschedule(group, freesAt, "Waiting for the daily cap", false);
          stats.held += group.length;
          continue;
        }
      }
      const content = groupedNotification(kind, group);
      if (!content) {
        await finish(group, "failed", { error: "No way to group these" });
        stats.failed += group.length;
        continue;
      }
      const payload: NotificationPayload = {
        ...content,
        data: { url: content.url, notification_id: group[0]!.id },
        kind,
        timeSensitive: group[0]!.passive === 0,
        badge: await needsYouCount(db, userId, now),
      };
      const result = await sendToUser(db, userId, payload, transports, send);
      if (result.devices > 0) {
        await finish(group, "sent", { devices: result.devices });
        stats.sent += group.length;
      } else if (result.total === 0) {
        await finish(group, "skipped", { error: "No registered device" });
        stats.skipped += group.length;
      } else if (Math.max(...group.map((row) => row.attempt_count)) >= MAX_ATTEMPTS) {
        await finish(group, "failed", { error: result.error });
        stats.failed += group.length;
      } else {
        await reschedule(group, new Date(now.getTime() + RETRY_DELAY_MS), result.error, true);
      }
    }
  }
  return stats;
}

// ─── New jobs once a day ─────────────────────────────────────────────────────

export interface DueDigest {
  userId: string;
  /** "new_jobs_daily:<local date>": one a day, whatever happens. */
  dedupeKey: string;
}

/**
 * People on once a day whose time has come today and who have new jobs
 * waiting. Without a time zone from their phone, US Eastern.
 */
export async function dailyDigestsDue(db: D1Database, now = new Date()): Promise<DueDigest[]> {
  const rows = await db.prepare(
    `SELECT ns.user_id, ns.daily_time, u.time_zone
     FROM notification_settings ns
     JOIN users u ON u.id = ns.user_id
     WHERE ns.kind = 'new_jobs' AND ns.enabled = 1 AND ns.mode = 'daily'
       AND EXISTS (
         SELECT 1 FROM notification_candidates nc
         WHERE nc.user_id = ns.user_id AND nc.status IN ('pending', 'retry')
       )`
  ).all<{ user_id: string; daily_time: string | null; time_zone: string | null }>();
  const due: DueDigest[] = [];
  for (const row of rows.results ?? []) {
    const zone = validTimeZone(row.time_zone, DEFAULT_TIME_ZONE);
    const [hour, minute] = (row.daily_time && DAILY_TIME.test(row.daily_time) ? row.daily_time : DEFAULT_DAILY_TIME)
      .split(":").map(Number) as [number, number];
    const local = localParts(now, zone);
    if (local.hour * 60 + local.minute < hour * 60 + minute) continue;
    const dedupeKey = `new_jobs_daily:${localDate(now, zone)}`;
    const done = await db.prepare("SELECT 1 FROM notification_log WHERE user_id = ? AND dedupe_key = ?")
      .bind(row.user_id, dedupeKey).first();
    if (!done) due.push({ userId: row.user_id, dedupeKey });
  }
  return due;
}

// ─── Opens ───────────────────────────────────────────────────────────────────

/**
 * Marks a tapped notification opened. Newer apps send its id; older ones send
 * the jobs it named, which finds the new-job alert that carried them.
 */
export async function markNotificationOpened(
  db: D1Database,
  userId: string,
  opened: { notificationId?: string | null; jobIds?: string[] },
  now = new Date()
): Promise<number> {
  const at = now.toISOString();
  let changes = 0;
  if (opened.notificationId) {
    const row = await db.prepare(
      "SELECT kind, sent_at FROM notification_log WHERE id = ? AND user_id = ?"
    ).bind(opened.notificationId, userId).first<{ kind: string; sent_at: string | null }>();
    if (row?.sent_at) {
      // A grouped push shares one id; its siblings went out in the same send.
      const result = await db.prepare(
        `UPDATE notification_log SET opened_at = ?
         WHERE user_id = ? AND kind = ? AND sent_at = ? AND opened_at IS NULL`
      ).bind(at, userId, row.kind, row.sent_at).run();
      changes += result.meta?.changes ?? 0;
    }
  }
  const jobIds = (opened.jobIds ?? []).slice(0, 50);
  if (!opened.notificationId && jobIds.length > 0) {
    const result = await db.prepare(
      `UPDATE notification_log SET opened_at = ?
       WHERE user_id = ? AND kind = 'new_jobs' AND status = 'sent' AND opened_at IS NULL
         AND entity_id IN (${jobIds.map(() => "?").join(", ")})`
    ).bind(at, userId, ...jobIds).run();
    changes += result.meta?.changes ?? 0;
  }
  return changes;
}

// ─── Product health ──────────────────────────────────────────────────────────

export interface KindMetrics {
  kind: string;
  sent: number;
  opened: number;
}

/** Sent and opened per kind in the last 30 days (Decisions: Admin #3). */
export async function notificationMetricsByKind(db: D1Database, now = new Date()): Promise<KindMetrics[]> {
  const rows = await db.prepare(
    `SELECT kind, COUNT(*) AS sent, SUM(CASE WHEN opened_at IS NOT NULL THEN 1 ELSE 0 END) AS opened
     FROM notification_log
     WHERE status = 'sent' AND sent_at > ?
     GROUP BY kind
     ORDER BY sent DESC`
  ).bind(new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString()).all<KindMetrics>();
  return (rows.results ?? []).map((row) => ({ kind: row.kind, sent: Number(row.sent), opened: Number(row.opened ?? 0) }));
}
