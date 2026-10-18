// The Activity stream and Today (docs/backend-inventory-2026-10-16.md, step 3).
//
// Activity is what happened: a stage moved (you, an email, later auto-apply),
// an email needs a choice, a date was set, a follow-up came due, a reply, a
// saved job closed, a new-jobs alert went out. Notifications start from it
// (notifyActivity), so Today, the badge and pushes agree.
//
// Needs you and Coming up are read from the current state of applications,
// emails and threads, so they clear themselves the moment the stage moves,
// a date is added, the email is filed or the follow-up is sent (Decisions #5).

import { isEndingStage, type ApplicationStage } from "../shared/application-stages";
import type { DetectedStage } from "../shared/email-tracking";
import type { OutreachThread } from "../shared/outreach";
import type { TodayEntry, TodayResponse } from "../shared/today";
import { listApplications } from "./applications";
import { listInboundEmails } from "./email/process";
import { DEFAULT_TIME_ZONE, localParts, validTimeZone, zonedTime } from "./local-time";
import {
  applicationMovedNotification,
  followUpNotification,
  isNotificationKind,
  repliedNotification,
  savedJobClosedNotification,
  STAGE_NEWS,
  whichApplicationNotification,
} from "./notification-kinds";
import { scheduleNotification } from "./notifications";
import { listThreads } from "./outreach/threads";

export type ActivityKind =
  | "stage_moved"
  | "email_needs_choice"
  | "date_set"
  | "reminder_due"
  | "follow_up_due"
  | "replied"
  | "saved_job_closed"
  | "new_jobs_sent";

export type ActivitySource = "user" | "email" | "auto_apply" | "system";

export interface ActivityRow {
  id: string;
  user_id: string;
  kind: ActivityKind;
  source: ActivitySource;
  application_id: string | null;
  event_id: string | null;
  job_id: string | null;
  inbound_email_id: string | null;
  thread_id: string | null;
  stage: string | null;
  detail_json: string;
  occurred_at: string;
}

export interface ActivityInput {
  userId: string;
  kind: ActivityKind;
  source: ActivitySource;
  applicationId?: string | null;
  jobId?: string | null;
  inboundEmailId?: string | null;
  threadId?: string | null;
  stage?: string | null;
  detail?: Record<string, string | number | boolean | null>;
  occurredAt: Date | string;
  /** Things that happen once per person ("saved_job_closed:<job>"). */
  dedupeKey?: string | null;
}

const ACTIVITY_FIELDS = `id, user_id, kind, source, application_id, event_id, job_id,
  inbound_email_id, thread_id, stage, detail_json, occurred_at`;

/** Writes one activity. Null when its dedupe key was already used. */
export async function recordActivity(db: D1Database, input: ActivityInput, now = new Date()): Promise<ActivityRow | null> {
  const id = crypto.randomUUID();
  const occurredAt = typeof input.occurredAt === "string" ? input.occurredAt : input.occurredAt.toISOString();
  const row = await db.prepare(
    `INSERT OR IGNORE INTO activity (
       id, user_id, kind, source, application_id, job_id, inbound_email_id, thread_id,
       stage, detail_json, occurred_at, dedupe_key, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     RETURNING ${ACTIVITY_FIELDS}`
  ).bind(
    id,
    input.userId,
    input.kind,
    input.source,
    input.applicationId ?? null,
    input.jobId ?? null,
    input.inboundEmailId ?? null,
    input.threadId ?? null,
    input.stage ?? null,
    JSON.stringify(input.detail ?? {}),
    occurredAt,
    input.dedupeKey ?? null,
    now.toISOString()
  ).first<ActivityRow>();
  return row ?? null;
}

/**
 * A stage move's activity, written in the same batch as its timeline entry
 * (applications.ts). It takes the person and job from the application.
 */
export function stageMoveActivity(
  db: D1Database,
  move: {
    eventId: string;
    applicationId: string;
    stage: ApplicationStage;
    source: ActivitySource;
    occurredAt: string;
    inboundEmailId: string | null;
  }
): D1PreparedStatement {
  return db.prepare(
    `INSERT INTO activity (
       id, user_id, kind, source, application_id, event_id, job_id, inbound_email_id,
       stage, occurred_at, created_at
     )
     SELECT ?, user_id, 'stage_moved', ?, id, ?, job_id, ?, ?, ?, ?
     FROM applications
     WHERE id = ? AND user_id IS NOT NULL`
  ).bind(
    crypto.randomUUID(),
    move.source,
    move.eventId,
    move.inboundEmailId,
    move.stage,
    move.occurredAt,
    move.occurredAt,
    move.applicationId
  );
}

/** The activities an inbound email wrote (its stage moves, or its "which application?"). */
export async function activityForEmail(db: D1Database, inboundEmailId: string): Promise<ActivityRow[]> {
  const rows = await db.prepare(
    `SELECT ${ACTIVITY_FIELDS} FROM activity WHERE inbound_email_id = ? ORDER BY occurred_at, rowid`
  ).bind(inboundEmailId).all<ActivityRow>();
  return rows.results ?? [];
}

/** The reply a thread's close recorded (closeThread writes it). */
export async function activityForThreadReply(db: D1Database, threadId: string): Promise<ActivityRow | null> {
  return db.prepare(
    `SELECT ${ACTIVITY_FIELDS} FROM activity WHERE thread_id = ? AND kind = 'replied' ORDER BY occurred_at DESC LIMIT 1`
  ).bind(threadId).first<ActivityRow>();
}

const NEWS_STAGES = new Set<string>(["assessment", "interview", "offer", "rejected"]);

/**
 * Turns an activity into its notification, when the kind has one: N3 an
 * email moved an application, N4 which application, N9 a saved job closed,
 * N10 a follow-up came due. Your own moves, dates and replies send nothing.
 * Returns whether a notification was queued.
 */
export async function notifyActivity(db: D1Database, activity: ActivityRow, now = new Date()): Promise<boolean> {
  const base = { userId: activity.user_id, scheduledFor: now };
  switch (activity.kind) {
    case "stage_moved": {
      if (activity.source !== "email" && activity.source !== "auto_apply") return false;
      if (!activity.stage || !NEWS_STAGES.has(activity.stage) || !activity.application_id) return false;
      const application = await db.prepare("SELECT id, company_name, title FROM applications WHERE id = ?")
        .bind(activity.application_id).first<{ id: string; company_name: string; title: string }>();
      if (!application) return false;
      const content = applicationMovedNotification(application, activity.stage as keyof typeof STAGE_NEWS);
      return scheduleNotification(db, {
        ...base,
        kind: "application_moved",
        dedupeKey: `application_moved:${activity.event_id ?? activity.id}`,
        title: content.title,
        body: content.body,
        url: content.url,
        timeSensitive: content.timeSensitive,
        entityType: "application",
        entityId: application.id,
      }, now);
    }
    case "email_needs_choice": {
      if (!activity.inbound_email_id) return false;
      const email = await db.prepare(
        `SELECT e.sender_name, c.name AS company_name
         FROM inbound_emails e LEFT JOIN companies c ON c.id = e.company_id
         WHERE e.id = ? AND e.status = 'needs_choice'`
      ).bind(activity.inbound_email_id).first<{ sender_name: string; company_name: string | null }>();
      if (!email) return false;
      return scheduleNotification(db, {
        ...base,
        kind: "which_application",
        dedupeKey: `which_application:${activity.inbound_email_id}`,
        ...whichApplicationNotification(email),
        entityType: "inbound_email",
        entityId: activity.inbound_email_id,
      }, now);
    }
    case "saved_job_closed": {
      if (!activity.job_id) return false;
      const job = await db.prepare(
        `SELECT a.company_name, a.title FROM applications a WHERE a.user_id = ? AND a.job_id = ? AND a.stage = 'saved'`
      ).bind(activity.user_id, activity.job_id).first<{ company_name: string; title: string }>();
      if (!job) return false;
      return scheduleNotification(db, {
        ...base,
        kind: "saved_job_closed",
        dedupeKey: `saved_job_closed:${activity.job_id}`,
        ...savedJobClosedNotification({ jobId: activity.job_id, company: job.company_name, title: job.title }),
        entityType: "job",
        entityId: activity.job_id,
      }, now);
    }
    case "follow_up_due": {
      const detail = JSON.parse(activity.detail_json) as { message_id?: string };
      if (!detail.message_id) return false;
      const row = await db.prepare(
        `SELECT om.step, ot.id AS thread_id, ot.job_id, c.name AS company_name, cc.name AS contact_name
         FROM outreach_messages om
         JOIN outreach_threads ot ON ot.id = om.thread_id
         JOIN companies c ON c.id = ot.company_id
         JOIN company_contacts cc ON cc.id = ot.contact_id
         WHERE om.id = ?`
      ).bind(detail.message_id).first<{ step: 1 | 2; thread_id: string; job_id: string | null; company_name: string; contact_name: string }>();
      if (!row) return false;
      return scheduleNotification(db, {
        ...base,
        kind: "follow_up",
        dedupeKey: `follow_up:${detail.message_id}`,
        ...followUpNotification(row),
        entityType: "outreach_message",
        entityId: detail.message_id,
      }, now);
    }
    case "replied": {
      // Only a reply email tracking saw; tapping "They replied" yourself sends nothing.
      if (activity.source !== "email" || !activity.thread_id) return false;
      const thread = await db.prepare(
        `SELECT ot.id, ot.job_id, c.name AS company_name, cc.name AS contact_name, j.title AS job_title
         FROM outreach_threads ot
         JOIN companies c ON c.id = ot.company_id
         JOIN company_contacts cc ON cc.id = ot.contact_id
         LEFT JOIN jobs j ON j.id = ot.job_id
         WHERE ot.id = ?`
      ).bind(activity.thread_id).first<{ id: string; job_id: string | null; company_name: string; contact_name: string; job_title: string | null }>();
      if (!thread) return false;
      return scheduleNotification(db, {
        ...base,
        kind: "replied",
        dedupeKey: `replied:${thread.id}`,
        ...repliedNotification(thread),
        entityType: "outreach_thread",
        entityId: thread.id,
      }, now);
    }
    case "reminder_due": {
      // The reminder's words and kind were worked out when it came due (reminders.ts).
      const detail = JSON.parse(activity.detail_json) as {
        notification_kind?: string;
        title?: string;
        body?: string;
        url?: string;
        time_sensitive?: boolean;
        dedupe_key?: string;
      };
      if (!detail.notification_kind || !isNotificationKind(detail.notification_kind) || !detail.title || !detail.url) return false;
      return scheduleNotification(db, {
        ...base,
        kind: detail.notification_kind,
        dedupeKey: detail.dedupe_key ?? `reminder:${activity.id}`,
        title: detail.title,
        body: detail.body ?? "",
        url: detail.url,
        timeSensitive: detail.time_sensitive === true,
        entityType: "application",
        entityId: activity.application_id,
      }, now);
    }
    default:
      return false;
  }
}

// ─── Today ───────────────────────────────────────────────────────────────────

/** What changed looks back this far: a weekend away still sees Friday's news. */
const CHANGED_DAYS = 3;
/** Coming up looks ahead two weeks. */
const AHEAD_DAYS = 14;
const DAY_MS = 86_400_000;
const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** A stage date as an instant: a calendar day is that day's start where the person is. */
function stageDateInstant(value: string, zone: string): number {
  const day = DAY.exec(value);
  return day ? zonedTime(Number(day[1]), Number(day[2]), Number(day[3]), 0, zone).getTime() : Date.parse(value);
}

function nextFollowUp(thread: OutreachThread) {
  if (thread.status !== "active") return undefined;
  return thread.messages
    .filter((message) => message.status === "scheduled" && message.due_at)
    .sort((a, b) => Date.parse(a.due_at!) - Date.parse(b.due_at!))[0];
}

/** How many things need the person: the app icon's badge. Cheap enough for every push. */
export async function needsYouCount(db: D1Database, userId: string, now = new Date()): Promise<number> {
  const row = await db.prepare(
    `SELECT
       (SELECT COUNT(*) FROM applications
        WHERE user_id = ? AND (stage = 'offer' OR (stage = 'interview' AND stage_date IS NULL)))
     + (SELECT COUNT(*) FROM inbound_emails WHERE user_id = ? AND status = 'needs_choice')
     + (SELECT COUNT(DISTINCT om.thread_id)
        FROM outreach_messages om JOIN outreach_threads ot ON ot.id = om.thread_id
        WHERE ot.user_id = ? AND ot.status = 'active' AND om.status = 'scheduled'
          AND om.due_at IS NOT NULL AND om.due_at <= ?) AS count`
  ).bind(userId, userId, userId, now.toISOString()).first<{ count: number }>();
  return Number(row?.count ?? 0);
}

interface ChangedRow extends ActivityRow {
  email_status: string | null;
}

/**
 * Today with the app's rules (Decisions #3): Needs you (an offer to answer,
 * an interview without a date, an email that matched several applications, a
 * follow-up that's due), What changed (steps email tracking filed and saved
 * postings that closed, in the last 3 days; your own moves aren't news) and
 * Coming up (dated steps and planned follow-ups through the next 2 weeks).
 */
export async function buildToday(db: D1Database, userId: string, now = new Date()): Promise<TodayResponse> {
  const [applications, emails, threads, user] = await Promise.all([
    listApplications(db, userId),
    listInboundEmails(db, userId, "needs_choice"),
    listThreads(db, userId),
    db.prepare("SELECT time_zone, today_seen_at FROM users WHERE id = ?").bind(userId)
      .first<{ time_zone: string | null; today_seen_at: string | null }>(),
  ]);
  const zone = validTimeZone(user?.time_zone, DEFAULT_TIME_ZONE);
  const seenAt = user?.today_seen_at ?? null;
  const byId = new Map(applications.map((application) => [application.id, application]));
  const isNew = (at: string) => !seenAt || Date.parse(at) > Date.parse(seenAt);

  const needsYou: TodayEntry[] = [];
  for (const application of applications) {
    if (application.stage === "offer") {
      needsYou.push({ kind: "offer_reply", key: `offer-${application.id}`, at: application.stage_changed_at, application });
    } else if (application.stage === "interview" && !application.stage_date) {
      needsYou.push({ kind: "interview_date", key: `date-${application.id}`, at: application.stage_changed_at, application });
    }
  }
  for (const email of emails) {
    // The logo of the company it's from, through the applications it matched.
    const match = email.candidates.map((candidate) => byId.get(candidate.id)).find(Boolean);
    needsYou.push({
      kind: "which_application",
      key: `email-${email.id}`,
      at: email.received_at,
      email,
      company_domain: match?.job?.company_domain || null,
    });
  }

  const local = localParts(now, zone);
  const todayStart = zonedTime(local.year, local.month, local.day, 0, zone).getTime();
  const horizon = todayStart + (AHEAD_DAYS + 1) * DAY_MS;
  const comingUp: TodayEntry[] = [];
  for (const thread of threads) {
    const next = nextFollowUp(thread);
    if (!next?.due_at) continue;
    const at = Date.parse(next.due_at);
    if (at <= now.getTime()) {
      needsYou.push({ kind: "follow_up_due", key: `follow-${thread.id}`, at: next.due_at, thread });
    } else if (at < horizon) {
      comingUp.push({ kind: "upcoming_follow_up", key: `planned-${thread.id}`, at: next.due_at, thread });
    }
  }
  needsYou.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));

  for (const application of applications) {
    if (!application.stage_date || isEndingStage(application.stage)) continue;
    if (!["interview", "assessment", "applied"].includes(application.stage)) continue;
    const at = stageDateInstant(application.stage_date, zone);
    if (Number.isNaN(at) || at < todayStart || at >= horizon) continue;
    comingUp.push({ kind: "upcoming_step", key: `upcoming-${application.id}`, at: new Date(at).toISOString(), application });
  }
  comingUp.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));

  const skip = new Set(needsYou.flatMap((entry) => "application" in entry ? [entry.application.id] : []));
  const recent = await db.prepare(
    `SELECT act.id, act.user_id, act.kind, act.source, act.application_id, act.event_id, act.job_id,
            act.inbound_email_id, act.thread_id, act.stage, act.detail_json, act.occurred_at,
            ie.status AS email_status
     FROM activity act
     LEFT JOIN inbound_emails ie ON ie.id = act.inbound_email_id
     WHERE act.user_id = ? AND act.occurred_at > ?
       AND ((act.kind = 'stage_moved' AND act.source IN ('email', 'auto_apply')) OR act.kind = 'saved_job_closed')
     ORDER BY act.occurred_at DESC, act.rowid DESC
     LIMIT 200`
  ).bind(userId, new Date(now.getTime() - CHANGED_DAYS * DAY_MS).toISOString()).all<ChangedRow>();
  const changed: TodayEntry[] = [];
  const filed = new Set<string>();
  for (const row of recent.results ?? []) {
    const application = row.application_id ? byId.get(row.application_id) : undefined;
    if (row.kind === "stage_moved") {
      // The app's rule: emails that moved or started an application, one row
      // per application (its latest), and not one that already needs you.
      if (row.source === "email" && row.email_status !== "applied" && row.email_status !== "created") continue;
      if (!application || skip.has(application.id) || filed.has(application.id)) continue;
      filed.add(application.id);
      changed.push({
        kind: "email_step",
        key: `changed-${row.inbound_email_id ?? row.id}`,
        at: row.occurred_at,
        application,
        stage: row.stage as DetectedStage,
        new: isNew(row.occurred_at),
      });
    } else {
      const saved = applications.find((candidate) => candidate.job_id === row.job_id && candidate.stage === "saved");
      if (!saved) continue;
      changed.push({ kind: "saved_job_closed", key: `closed-${saved.id}`, at: row.occurred_at, application: saved, new: isNew(row.occurred_at) });
    }
  }

  return {
    needs_you: needsYou,
    changed,
    coming_up: comingUp,
    badge: needsYou.length,
    seen_at: seenAt,
    tracking: applications.length,
  };
}

/** Opening Today marks it seen on every device. */
export async function markTodaySeen(db: D1Database, userId: string, now = new Date()): Promise<string> {
  const at = now.toISOString();
  await db.prepare("UPDATE users SET today_seen_at = ? WHERE id = ?").bind(at, userId).run();
  return at;
}
