// Reminders from an application's date (docs/backend-inventory-2026-10-16.md,
// step 4; Decisions: Application dates and gaps #1 to #5), in the person's own
// time zone:
//
// - N5 interview: the evening before at 6 pm, and an hour before when the time
//   is known (time-sensitive); with only a day, 8 am that morning.
// - N6 assessment due: 9 am the day before, and the morning it's due.
// - N7 offer reply-by: 3 days before and the morning before (time-sensitive).
// - N8 no word yet: the morning after the hear-back date passes; without a
//   date, once at 3 weeks after applying and once at 6, then never.
//
// Nothing is stored ahead of time. Every minute the tick works out which
// reminders are due from each application as it is now, so a new date, a
// moved stage or a removed application changes them with nothing to cancel.
// A due reminder goes into the Activity stream, and its push starts there.

import type { ApplicationStage } from "../shared/application-stages";
import { notifyActivity, recordActivity } from "./activity";
import { DEFAULT_TIME_ZONE, localParts, validTimeZone, zonedTime } from "./local-time";
import { notificationLinks, type NotificationKind } from "./notification-kinds";
import type { Env } from "./types";

export type ReminderType =
  | "interview_evening_before"
  | "interview_morning"
  | "interview_hour_before"
  | "assessment_day_before"
  | "assessment_morning"
  | "offer_three_days"
  | "offer_morning_before";

export interface ReminderApplication {
  id: string;
  user_id: string;
  job_id: string | null;
  company_name: string;
  title: string;
  stage: ApplicationStage;
  stage_date: string | null;
  applied_at: string | null;
}

export interface PlannedReminder {
  type: ReminderType;
  kind: NotificationKind;
  /** When it goes out. */
  at: Date;
  /** After this it's no use (the interview started, the day ended). */
  until: Date;
  title: string;
  body: string;
  url: string;
  timeSensitive: boolean;
  /** One reminder per application, type and date: a new date is a new reminder. */
  dedupeKey: string;
}

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

interface LocalDay {
  year: number;
  month: number;
  day: number;
}

function addDays(date: LocalDay, days: number): LocalDay {
  const shifted = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
  return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() + 1, day: shifted.getUTCDate() };
}

function at(date: LocalDay, hour: number, zone: string): Date {
  return zonedTime(date.year, date.month, date.day, hour, zone);
}

/** The stage date as a local day, and its moment when the time is known. */
function readStageDate(value: string, zone: string): { day: LocalDay; moment: Date | null } | null {
  const day = DAY.exec(value);
  if (day) return { day: { year: Number(day[1]), month: Number(day[2]), day: Number(day[3]) }, moment: null };
  const moment = new Date(value);
  if (Number.isNaN(moment.getTime())) return null;
  const local = localParts(moment, zone);
  return { day: { year: local.year, month: local.month, day: local.day }, moment };
}

function clock(moment: Date, zone: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: zone, hour: "numeric", minute: "2-digit" }).format(moment);
}

function weekday(date: LocalDay, zone: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: zone, weekday: "long" }).format(at(date, 12, zone));
}

/** Every reminder an application has as it stands, due or not. */
export function plannedReminders(application: ReminderApplication, zone: string): PlannedReminder[] {
  const company = application.company_name;
  const url = notificationLinks.application(application.id);
  const plan = (
    type: ReminderType,
    kind: NotificationKind,
    when: Date,
    until: Date,
    title: string,
    anchor: string,
    timeSensitive = false
  ): PlannedReminder => ({
    type,
    kind,
    at: when,
    until,
    title,
    body: application.title,
    url,
    timeSensitive,
    dedupeKey: `reminder:${application.id}:${type}:${anchor}`,
  });

  const reminders: PlannedReminder[] = [];
  const dated = application.stage_date ? readStageDate(application.stage_date, zone) : null;
  const anchor = application.stage_date ?? "";

  if (application.stage === "interview" && dated) {
    const eveningBefore = at(addDays(dated.day, -1), 18, zone);
    if (dated.moment) {
      const time = clock(dated.moment, zone);
      reminders.push(plan("interview_evening_before", "interview_reminder", eveningBefore,
        new Date(Math.min(eveningBefore.getTime() + 4 * HOUR_MS, dated.moment.getTime())),
        `Interview with ${company} tomorrow at ${time}`, anchor));
      const hourBefore = new Date(dated.moment.getTime() - HOUR_MS);
      reminders.push(plan("interview_hour_before", "interview_reminder", hourBefore, dated.moment,
        `Interview with ${company} in an hour, at ${time}`, anchor, true));
    } else {
      reminders.push(plan("interview_evening_before", "interview_reminder", eveningBefore,
        new Date(eveningBefore.getTime() + 4 * HOUR_MS), `Interview with ${company} tomorrow`, anchor));
      const morning = at(dated.day, 8, zone);
      reminders.push(plan("interview_morning", "interview_reminder", morning,
        new Date(morning.getTime() + 4 * HOUR_MS), `Interview with ${company} today`, anchor));
    }
  }

  if (application.stage === "assessment" && dated) {
    const time = dated.moment ? ` at ${clock(dated.moment, zone)}` : "";
    const due = dated.moment ?? at(addDays(dated.day, 1), 0, zone);
    const dayBefore = at(addDays(dated.day, -1), 9, zone);
    reminders.push(plan("assessment_day_before", "assessment_due", dayBefore,
      new Date(Math.min(dayBefore.getTime() + 12 * HOUR_MS, due.getTime())),
      `${company} assessment due tomorrow${time}`, anchor));
    const morning = at(dated.day, 8, zone);
    if (morning < due) {
      reminders.push(plan("assessment_morning", "assessment_due", morning, due,
        `${company} assessment due today${time}`, anchor));
    }
  }

  if (application.stage === "offer" && dated) {
    const replyBy = dated.moment ?? at(addDays(dated.day, 1), 0, zone);
    const threeDays = at(addDays(dated.day, -3), 9, zone);
    reminders.push(plan("offer_three_days", "offer_reply", threeDays,
      new Date(Math.min(threeDays.getTime() + DAY_MS, replyBy.getTime())),
      `Reply to ${company}'s offer by ${weekday(dated.day, zone)}`, anchor));
    const morningBefore = at(addDays(dated.day, -1), 8, zone);
    reminders.push(plan("offer_morning_before", "offer_reply", morningBefore,
      new Date(Math.min(morningBefore.getTime() + 12 * HOUR_MS, replyBy.getTime())),
      `Reply to ${company}'s offer by tomorrow`, anchor, true));
  }
  // No "no word yet" (N8): with a hundred applications out, not hearing
  // back is normal and nothing to act on (owner, 2026-10-22).
  return reminders;
}

/**
 * Runs on the every-minute tick: writes each reminder that has come due to
 * the Activity stream (once, by its key) and queues its push from there.
 */
export async function queueDueReminders(env: Env, now = new Date()): Promise<number> {
  const rows = await env.DB.prepare(
    `SELECT a.id, a.user_id, a.job_id, a.company_name, a.title, a.stage, a.stage_date, a.applied_at,
            u.time_zone
     FROM applications a
     JOIN users u ON u.id = a.user_id
     WHERE a.stage IN ('interview', 'assessment', 'offer') AND a.stage_date IS NOT NULL
     LIMIT 5000`
  ).all<ReminderApplication & { time_zone: string | null }>();

  let queued = 0;
  for (const application of rows.results ?? []) {
    const zone = validTimeZone(application.time_zone, DEFAULT_TIME_ZONE);
    for (const reminder of plannedReminders(application, zone)) {
      if (reminder.at > now || reminder.until <= now) continue;
      const activity = await recordActivity(env.DB, {
        userId: application.user_id,
        kind: "reminder_due",
        source: "system",
        applicationId: application.id,
        jobId: application.job_id,
        stage: application.stage,
        detail: {
          type: reminder.type,
          notification_kind: reminder.kind,
          title: reminder.title,
          body: reminder.body,
          url: reminder.url,
          time_sensitive: reminder.timeSensitive,
          dedupe_key: reminder.dedupeKey,
        },
        occurredAt: now,
        dedupeKey: reminder.dedupeKey,
      }, now);
      if (activity && await notifyActivity(env.DB, activity, now)) queued += 1;
    }
  }
  return queued;
}
