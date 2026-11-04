import type { ApplySendStatus, SendNeed } from "../../shared/auto-apply";
import { localParts, validTimeZone, zonedTime } from "../local-time";
import { applyAskNotification } from "../notification-kinds";
import { scheduleNotification } from "../notifications";
import type { Env } from "../types";

/**
 * An ask waits for a check (owner, 2026-11-04): before "Apply for you?" goes
 * out, Pinkslip fills the job's form once on the server without pressing
 * Submit (a dry run, kept out of the person's sends). Only a form it could
 * send asks: one it filled, or one that stopped only on questions the person
 * can answer. Anything else (a field it couldn't fill, a bot check, a gone
 * posting) never asks, and the job's new-job alert goes out as usual.
 *
 * Kept apart from asks.ts so sends.ts can call it without a cycle.
 */

/** An ask found between 10pm and 8am waits for the morning. */
const QUIET_FROM = 22;
const QUIET_UNTIL = 8;

/** When an ask found now goes out: straight away, or 8am if it's night where the person is. */
export function askTime(now: Date, timeZone: string): Date {
  const local = localParts(now, timeZone);
  if (local.hour >= QUIET_UNTIL && local.hour < QUIET_FROM) return now;
  if (local.hour < QUIET_UNTIL) return zonedTime(local.year, local.month, local.day, QUIET_UNTIL, timeZone);
  const tomorrow = new Date(Date.UTC(local.year, local.month - 1, local.day + 1));
  return zonedTime(tomorrow.getUTCFullYear(), tomorrow.getUTCMonth() + 1, tomorrow.getUTCDate(), QUIET_UNTIL, timeZone);
}

/** The person's day that `instant` falls in, as UTC instants: [start, end). */
export function dayAround(instant: Date, timeZone: string): [Date, Date] {
  const local = localParts(instant, timeZone);
  const next = new Date(Date.UTC(local.year, local.month - 1, local.day + 1));
  return [
    zonedTime(local.year, local.month, local.day, 0, timeZone),
    zonedTime(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate(), 0, timeZone),
  ];
}

/** One push per job: the ask (or the automatic send's own push) replaces its new-job alert. */
export async function skipAlert(db: D1Database, userId: string, jobId: string) {
  await db.prepare(
    `UPDATE notification_candidates SET status = 'skipped', last_error = 'Asked to apply instead'
     WHERE user_id = ? AND job_id = ? AND status = 'pending'`
  ).bind(userId, jobId).run();
}

/** A check that didn't ask hands the job back to its new-job alert. */
export async function restoreAlert(db: D1Database, userId: string, jobId: string) {
  await db.prepare(
    `UPDATE notification_candidates SET status = 'pending', last_error = NULL
     WHERE user_id = ? AND job_id = ? AND status = 'skipped' AND last_error = 'Asked to apply instead'`
  ).bind(userId, jobId).run();
}

/** The "Apply for you?" push, at `notifyAt`. */
export async function scheduleAsk(db: D1Database, userId: string, job: { id: string; company: string; title: string }, notifyAt: Date, now: Date) {
  await scheduleNotification(db, {
    userId,
    ...applyAskNotification({ company: job.company, title: job.title, jobId: job.id }),
    kind: "apply_ask",
    dedupeKey: `apply_ask:${job.id}`,
    entityType: "job",
    entityId: job.id,
    scheduledFor: notifyAt,
  }, now);
}

/** Whether a check's dry run ended on a form Pinkslip could send. */
export function checkPassed(status: ApplySendStatus, needs: SendNeed[]): boolean {
  if (status === "ready") return true;
  // Questions only the person can answer still ask; a field Pinkslip
  // couldn't fill (an error) or a resume it couldn't attach doesn't.
  return status === "needs_you" && needs.length > 0 && needs.every((need) => need.kind !== "error" && need.kind !== "file");
}

/** A check's dry run has ended: ask, or hand the job back to its alert. */
export async function concludeAskCheck(
  env: Env,
  send: { user_id: string; job_id: string },
  status: ApplySendStatus,
  needs: SendNeed[],
  now: Date,
): Promise<void> {
  const db = env.DB;
  const ask = await db.prepare("SELECT id FROM apply_asks WHERE user_id = ? AND job_id = ? AND status = 'checking'")
    .bind(send.user_id, send.job_id).first<{ id: string }>();
  if (!ask) return;
  const at = now.toISOString();
  const facts = await db.prepare(
    `SELECT u.time_zone, j.title, j.closed_at, c.name AS company, s.mode, s.paused_until,
            EXISTS (SELECT 1 FROM applications a WHERE a.user_id = u.id AND a.job_id = j.id AND a.stage != 'saved') AS applied
     FROM users u JOIN jobs j ON j.id = ? JOIN companies c ON c.id = j.company_id
     LEFT JOIN auto_apply_settings s ON s.user_id = u.id
     WHERE u.id = ?`
  ).bind(send.job_id, send.user_id).first<{
    time_zone: string | null; title: string; closed_at: string | null; company: string;
    mode: string | null; paused_until: string | null; applied: number;
  }>();
  // Still wanted: open, not applied meanwhile, auto-apply on and not paused.
  const stillWanted = facts !== null && !facts.closed_at && !facts.applied && facts.mode !== "off"
    && !(facts.paused_until && facts.paused_until > at);
  if (!facts || !stillWanted || !checkPassed(status, needs)) {
    await db.prepare("UPDATE apply_asks SET status = 'skipped', decided_at = ? WHERE id = ? AND status = 'checking'").bind(at, ask.id).run();
    await restoreAlert(db, send.user_id, send.job_id);
    return;
  }
  const notifyAt = askTime(now, validTimeZone(facts.time_zone));
  const asked = await db.prepare("UPDATE apply_asks SET status = 'asked', notify_at = ? WHERE id = ? AND status = 'checking'")
    .bind(notifyAt.toISOString(), ask.id).run();
  if ((asked.meta?.changes ?? 0) === 0) return;
  await scheduleAsk(db, send.user_id, { id: send.job_id, company: facts.company, title: facts.title }, notifyAt, now);
  // The alert was held for the check; make sure it stays quiet.
  await skipAlert(db, send.user_id, send.job_id);
}
