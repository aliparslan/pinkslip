import {
  type ApplyAskAction,
  type AutoApplyMode,
  type AutoApplyPause,
  type AutoApplySettings,
} from "../../shared/apply-asks";
import { SENDABLE_ATS, type ApplySend } from "../../shared/auto-apply";
import { specificRoleSpecialties, type SearchProfile } from "../../shared/search-profile";
import type { JobListing } from "../adapters/types";
import type { JobFeatures } from "../job-features";
import { validTimeZone } from "../local-time";
import { allowanceFor, currentPlan, releaseAllowance } from "../plans";
import type { Env } from "../types";
import { evaluateJobForProfile, prepareJobsForMatching } from "../user-job-matches";
import { searchProfileFromRow, type SearchProfileRow } from "../user-preferences";
import { SendError, queueSend } from "./sends";
import { askTime, dayAround, restoreAlert, skipAlert } from "./ask-checks";

export { askTime } from "./ask-checks";

/**
 * Asking as strong matches post (owner, 2026-10-29; Decisions: Auto-apply #2,
 * revisited). There's no morning list: as the alert cycle matches new jobs,
 * a strong match either asks with one push, "Apply for you?" (Ask me, the
 * default, Pro included), or is sent with no ask (Apply for me, Pro). Either
 * way it takes the place of that job's new-job alert, and a person is never
 * asked about a job twice. Required questions only the person can answer
 * still stop a send and come back together (worker/apply/plan.ts).
 *
 * An ask goes out only after its form checks out (ask-checks.ts), and at
 * most ASKS_PER_DAY a day, freshest first (owner, 2026-11-04).
 */

/** "Until I turn it back on". */
const FOREVER = "9999-12-31T00:00:00.000Z";
const DAY_MS = 24 * 60 * 60 * 1000;
/** Pinkslip sends these forms itself; anything else stays a normal alert. */
const SENDABLE = SENDABLE_ATS;
const JOBS_PER_PASS = 90;
/** Asks a person gets in their day; past it, strong matches get the normal alert. */
export const ASKS_PER_DAY = 5;
/** Checks started in a day, counting ones whose form didn't check out. */
const CHECKS_PER_DAY = 10;

export class AskError extends Error {
  constructor(message: string, readonly status: 400 | 403 | 404, readonly code: string) {
    super(message);
  }
}

// ─── Settings and Pause ──────────────────────────────────────────────────────

export async function loadAutoApplySettings(env: Env, userId: string, now = new Date()): Promise<AutoApplySettings> {
  const [row, { plan }] = await Promise.all([
    env.DB.prepare("SELECT mode, paused_until FROM auto_apply_settings WHERE user_id = ?")
      .bind(userId).first<{ mode: AutoApplyMode; paused_until: string | null }>(),
    currentPlan(env, userId, now),
  ]);
  const paused = row?.paused_until && row.paused_until > now.toISOString() ? row.paused_until : null;
  return { mode: row?.mode ?? "ask", paused_until: paused, paused_indefinitely: paused === FOREVER, can_automate: plan === "pro" };
}

/**
 * Sets the mode, pauses or resumes (`pause: null`). Apply for me is Pro.
 * Pausing, or leaving Apply for me, stops automatic sends that haven't
 * started yet; nothing already being filled is cut off halfway.
 */
export async function saveAutoApplySettings(
  env: Env,
  userId: string,
  input: { mode?: AutoApplyMode; pause?: AutoApplyPause | null },
  now = new Date(),
): Promise<AutoApplySettings> {
  const current = await loadAutoApplySettings(env, userId, now);
  if (input.mode === "auto" && !current.can_automate) throw new AskError("Apply for me is part of Pro.", 403, "pro_only");
  const mode = input.mode ?? current.mode;
  const pausedUntil = input.pause === undefined
    ? current.paused_until
    : input.pause === null
      ? null
      : input.pause === "until_resumed"
        ? FOREVER
        : new Date(now.getTime() + (input.pause === "week" ? 7 : 1) * DAY_MS).toISOString();
  await env.DB.prepare(
    `INSERT INTO auto_apply_settings (user_id, mode, paused_until, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET mode = excluded.mode, paused_until = excluded.paused_until, updated_at = excluded.updated_at`
  ).bind(userId, mode, pausedUntil, now.toISOString()).run();
  if (pausedUntil || mode !== "auto") await stopQueuedAutomaticSends(env, userId, now);
  return loadAutoApplySettings(env, userId, now);
}

/** Automatic sends still waiting to start end before they open a form, and
 * their allowance comes back. */
async function stopQueuedAutomaticSends(env: Env, userId: string, now: Date) {
  const at = now.toISOString();
  const queued = await env.DB.prepare(
    `SELECT s.id, s.ledger_id FROM apply_sends s
     JOIN apply_asks a ON a.send_id = s.id
     WHERE a.user_id = ? AND a.status = 'sent' AND s.status = 'queued'`
  ).bind(userId).all<{ id: string; ledger_id: string | null }>();
  for (const send of queued.results ?? []) {
    const stopped = await env.DB.prepare(
      `UPDATE apply_sends SET status = 'failed', detail = 'Paused before it started. Nothing was sent.', finished_at = ?, updated_at = ?
       WHERE id = ? AND status = 'queued'`
    ).bind(at, at, send.id).run();
    if ((stopped.meta?.changes ?? 0) > 0 && send.ledger_id) await releaseAllowance(env.DB, send.ledger_id, now);
  }
}

// ─── Strong matches ──────────────────────────────────────────────────────────

/**
 * A strong match clears the new-job alert's bar and more: the role matched
 * one the person picked (or a title they added), not just a word in the
 * title; it isn't a standing requisition; and Pinkslip can send its form.
 */
export function isStrongMatch(input: {
  jobId: string;
  listing: JobListing;
  features: JobFeatures;
  profile: SearchProfile;
  evergreen: boolean;
  atsType: string | null;
}): boolean {
  if (input.evergreen || !SENDABLE.has(input.atsType ?? "")) return false;
  if (!evaluateJobForProfile(input.jobId, input.listing, input.features, input.profile, false).plausible) return false;
  const title = input.listing.title.toLowerCase();
  return specificRoleSpecialties(input.features.specialties).some((role) => input.profile.roles.includes(role))
    || input.profile.custom_titles.some((custom) => custom.trim() !== "" && title.includes(custom.trim().toLowerCase()));
}

interface Person extends SearchProfileRow {
  user_id: string;
  time_zone: string | null;
  mode: AutoApplyMode | null;
  has_device: number;
}

interface JobFacts {
  id: string;
  company_id: string;
  company: string;
  title: string;
  evergreen: number;
  ats_type: string | null;
}

const placeholders = (count: number) => Array.from({ length: count }, () => "?").join(", ");

/**
 * The alert cycle's step for new jobs, after matching and before delivery:
 * asks about or sends each strong match for everyone with sends open, auto-
 * apply on and no pause, and skips that job's new-job alert. A person with
 * no plan sends left isn't asked; the job gets the normal alert. Returns how
 * many jobs it acted on.
 */
/** What starts a send; tests stand in for it. */
export interface AskDeps {
  queue: typeof queueSend;
}

const defaultDeps: AskDeps = { queue: queueSend };

export async function askForStrongMatches(
  env: Env,
  jobs: Array<{ jobId: string; listing: JobListing; features?: JobFeatures }>,
  now = new Date(),
  deps: AskDeps = defaultDeps,
): Promise<number> {
  const flag = env.AUTO_APPLY_SEND?.trim().toLowerCase();
  if (jobs.length === 0 || (flag !== "on" && flag !== "admin") || !env.APPLY_SEND) return 0;
  // D1 binds at most 100 values a query; the alert cycle sends 25 at a time.
  if (jobs.length > JOBS_PER_PASS) {
    let acted = 0;
    for (let offset = 0; offset < jobs.length; offset += JOBS_PER_PASS) {
      acted += await askForStrongMatches(env, jobs.slice(offset, offset + JOBS_PER_PASS), now, deps);
    }
    return acted;
  }
  const db = env.DB;
  const ids = jobs.map((job) => job.jobId);
  const facts = new Map(((await db.prepare(
    `SELECT j.id, j.company_id, c.name AS company, j.title, j.evergreen, c.ats_type
     FROM jobs j JOIN companies c ON c.id = j.company_id
     WHERE j.id IN (${placeholders(ids.length)}) AND j.closed_at IS NULL`
  ).bind(...ids).all<JobFacts>()).results ?? []).map((row) => [row.id, row]));
  const sendable = prepareJobsForMatching(jobs.filter((job) => facts.has(job.jobId) && SENDABLE.has(facts.get(job.jobId)!.ats_type ?? "")));
  if (sendable.length === 0) return 0;

  const people = (await db.prepare(
    `SELECT u.id AS user_id, u.time_zone, s.mode, usp.profile_json, usp.notifications_enabled,
            usp.onboarding_version, usp.onboarding_completed_at,
            EXISTS (SELECT 1 FROM push_subscriptions ps WHERE ps.user_id = u.id) AS has_device
     FROM users u
     JOIN user_search_profiles usp ON usp.user_id = u.id
     LEFT JOIN auto_apply_settings s ON s.user_id = u.id
     WHERE COALESCE(s.mode, 'ask') != 'off'
       AND (s.paused_until IS NULL OR s.paused_until <= ?)
       AND EXISTS (SELECT 1 FROM auth_identities ai WHERE ai.user_id = u.id)
       ${flag === "admin"
         ? "AND (u.role = 'admin' OR EXISTS (SELECT 1 FROM feature_grants g WHERE g.user_id = u.id AND g.flag = 'AUTO_APPLY_SEND'))"
         : ""}`
  ).bind(now.toISOString()).all<Person>()).results ?? [];

  let acted = 0;
  for (const person of people) {
    const profile = searchProfileFromRow(person);
    const strong = sendable.filter((job) => isStrongMatch({
      jobId: job.jobId,
      listing: job.listing,
      features: job.features,
      profile,
      evergreen: facts.get(job.jobId)!.evergreen === 1,
      atsType: facts.get(job.jobId)!.ats_type,
    }));
    if (strong.length === 0) continue;
    // Freshest first, so the day's asks go to the newest postings.
    const posted = new Map(strong.map((job) => [job.jobId, job.listing.postedAt ?? ""]));
    const fresh = (await notYetHandled(db, person.user_id, strong.map((job) => facts.get(job.jobId)!)))
      .sort((a, b) => (posted.get(b.id) ?? "").localeCompare(posted.get(a.id) ?? ""));
    for (const job of fresh) {
      try {
        acted += await actOnStrongMatch(env, person, job, now, deps) ? 1 : 0;
      } catch (error) {
        console.error("Auto-apply ask failed:", error instanceof Error ? error.message : String(error));
      }
    }
  }
  return acted;
}

/** Leaves out jobs already asked about, sent, applied to past Saved, or at a hidden company. */
async function notYetHandled(db: D1Database, userId: string, jobs: JobFacts[]): Promise<JobFacts[]> {
  const ids = jobs.map((job) => job.id);
  const companies = [...new Set(jobs.map((job) => job.company_id))];
  const [asked, sent, applied, hidden] = await Promise.all([
    db.prepare(`SELECT job_id FROM apply_asks WHERE user_id = ? AND job_id IN (${placeholders(ids.length)})`).bind(userId, ...ids).all<{ job_id: string }>(),
    db.prepare(`SELECT job_id FROM apply_sends WHERE user_id = ? AND dry_run = 0 AND job_id IN (${placeholders(ids.length)})`).bind(userId, ...ids).all<{ job_id: string }>(),
    db.prepare(`SELECT job_id FROM applications WHERE user_id = ? AND stage != 'saved' AND job_id IN (${placeholders(ids.length)})`).bind(userId, ...ids).all<{ job_id: string }>(),
    db.prepare(`SELECT company_id FROM user_blocked_companies WHERE user_id = ? AND company_id IN (${placeholders(companies.length)})`).bind(userId, ...companies).all<{ company_id: string }>(),
  ]);
  const done = new Set([...asked.results ?? [], ...sent.results ?? [], ...applied.results ?? []].map((row) => row.job_id));
  const hiddenCompanies = new Set((hidden.results ?? []).map((row) => row.company_id));
  return jobs.filter((job) => !done.has(job.id) && !hiddenCompanies.has(job.company_id));
}

/** Sends it (Apply for me, on Pro) or asks (Ask me). False when it left the job to the normal alert. */
async function actOnStrongMatch(env: Env, person: Person, job: JobFacts, now: Date, deps: AskDeps): Promise<boolean> {
  const db = env.DB;
  const automatic = person.mode === "auto" && (await currentPlan(env, person.user_id, now)).plan === "pro";
  if (automatic) {
    let send: ApplySend;
    try {
      send = await deps.queue(env, person.user_id, { jobId: job.id, dryRun: false }, { now });
    } catch (error) {
      // Out of sends, the posting closed, no resume yet: the normal alert says it.
      if (error instanceof SendError) return false;
      throw error;
    }
    await recordAsk(db, person.user_id, job.id, "sent", { sendId: send.id, now });
    await skipAlert(db, person.user_id, job.id);
    return true;
  }

  if (!person.has_device) return false;
  const allowance = await allowanceFor(env, person.user_id, "auto_apply_send", now);
  if (allowance.used >= allowance.limit) return false;
  const zone = validTimeZone(person.time_zone);
  const notifyAt = askTime(now, zone);
  if (!(await roomToAsk(db, person.user_id, notifyAt, now, zone))) return false;
  // The form is checked first (ask-checks.ts); its alert waits meanwhile.
  if (!(await recordAsk(db, person.user_id, job.id, "checking", { notifyAt, now }))) return false;
  await skipAlert(db, person.user_id, job.id);
  try {
    await deps.queue(env, person.user_id, { jobId: job.id, dryRun: true, forAsk: true }, { now });
  } catch (error) {
    await db.prepare("UPDATE apply_asks SET status = 'skipped', decided_at = ? WHERE user_id = ? AND job_id = ? AND status = 'checking'")
      .bind(now.toISOString(), person.user_id, job.id).run();
    await restoreAlert(db, person.user_id, job.id);
    // No resume yet, the posting closed: the normal alert says it.
    if (error instanceof SendError) return false;
    throw error;
  }
  return true;
}

/** Under the day's asks (ASKS_PER_DAY, in the day the push would go out)
 * and the day's checks. */
async function roomToAsk(db: D1Database, userId: string, notifyAt: Date, now: Date, zone: string): Promise<boolean> {
  const [askFrom, askTo] = dayAround(notifyAt, zone);
  const [checkFrom, checkTo] = dayAround(now, zone);
  const counts = await db.prepare(
    `SELECT
       COALESCE(SUM(CASE WHEN status IN ('checking', 'asked', 'applied', 'dismissed') AND notify_at >= ? AND notify_at < ? THEN 1 ELSE 0 END), 0) AS asks,
       COALESCE(SUM(CASE WHEN status != 'sent' AND created_at >= ? AND created_at < ? THEN 1 ELSE 0 END), 0) AS checks
     FROM apply_asks WHERE user_id = ?`
  ).bind(askFrom.toISOString(), askTo.toISOString(), checkFrom.toISOString(), checkTo.toISOString(), userId)
    .first<{ asks: number; checks: number }>();
  return (counts?.asks ?? 0) < ASKS_PER_DAY && (counts?.checks ?? 0) < CHECKS_PER_DAY;
}

/** Writes the ask once; false when the person already had one for the job. */
async function recordAsk(
  db: D1Database,
  userId: string,
  jobId: string,
  status: "checking" | "sent",
  fields: { sendId?: string; notifyAt?: Date; now: Date },
): Promise<boolean> {
  const at = fields.now.toISOString();
  const result = await db.prepare(
    `INSERT OR IGNORE INTO apply_asks (id, user_id, job_id, status, send_id, notify_at, created_at, decided_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(crypto.randomUUID(), userId, jobId, status, fields.sendId ?? null, fields.notifyAt?.toISOString() ?? null, at, status === "sent" ? at : null).run();
  return (result.meta?.changes ?? 0) > 0;
}

// ─── The push's buttons ──────────────────────────────────────────────────────

/**
 * Apply starts the send, as Apply on the job's page does (its refusals, such
 * as no sends left, come back as SendError). Not this one dismisses the job;
 * it teaches nothing for now (owner, 2026-10-29).
 */
export async function answerAsk(
  env: Env,
  userId: string,
  jobId: string,
  action: ApplyAskAction,
  now = new Date(),
  deps: AskDeps = defaultDeps,
): Promise<{ status: "applied" | "dismissed" | "sent"; send: ApplySend | null }> {
  const ask = await env.DB.prepare("SELECT id, status, send_id FROM apply_asks WHERE user_id = ? AND job_id = ?")
    .bind(userId, jobId).first<{ id: string; status: string; send_id: string | null }>();
  // A check still filling, or one that didn't ask, has no push to answer.
  if (!ask || ask.status === "checking" || ask.status === "skipped") throw new AskError("Pinkslip didn't ask about this job.", 404, "not_found");
  const at = now.toISOString();
  if (action === "dismiss") {
    await env.DB.prepare("UPDATE apply_asks SET status = 'dismissed', decided_at = ? WHERE id = ? AND status = 'asked'").bind(at, ask.id).run();
    return { status: ask.status === "asked" ? "dismissed" : ask.status as "applied" | "sent", send: null };
  }
  const send = await deps.queue(env, userId, { jobId, dryRun: false, ...(ask.send_id ? { sendId: ask.send_id } : {}) }, { now });
  await env.DB.prepare("UPDATE apply_asks SET status = 'applied', send_id = ?, decided_at = ? WHERE id = ? AND status IN ('asked', 'dismissed')")
    .bind(send.id, at, ask.id).run();
  return { status: ask.status === "sent" ? "sent" : "applied", send };
}
