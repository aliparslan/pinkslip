import { getCompanySourceType } from "../ats";
import { trackJob } from "../applications";
import { releaseAllowance, reserveAllowance } from "../plans";
import { scheduleNotification } from "../notifications";
import { applySendNotification } from "../notification-kinds";
import type { CompanyRow, Env } from "../types";
import type { ApplyPlan, FormControl } from "../../shared/application-form";
import { SENDABLE_ATS, type ApplySend, type ApplySendStatus, type SendNeed, type SentAnswer } from "../../shared/auto-apply";
import { applicationUrl, fetchApplicationForm, type FormSource } from "./forms";
import { learnAnswers, planApplication } from "./plan";
import { openFormPage, reconnectFormPage, type OpenedPage } from "./browser";
import { enterCode, fillPlan, isEmpty, keptForm, prepareForm, recheck, submit, type FillProgress, type Prepared } from "./send-engine";
import { applyResumeKey, loadResume, shotKey } from "./send-files";
import { concludeAskCheck } from "./ask-checks";
import { WAIT_MS, answersBySend, canAnswerInSheet, parseNeeds, tellWaiting, waitingRows } from "./waiting";

/**
 * Auto-apply's server sends (step 10, phase 1; docs/auto-apply-phase1-2026-10-24.md).
 * `queueSend` checks the job and the person, reserves the allowance and
 * starts the Workflow (send-workflow.ts), which runs `runSend` and, when
 * Greenhouse emails a code, `enterSendCode`. Everything a send put on the
 * form is kept, with a picture of the filled form and of the confirmation.
 */

const SEND_ATS = SENDABLE_ATS;
/** Statuses where something went out, or may have: the allowance stays used. */
const SENT: ReadonlySet<ApplySendStatus> = new Set(["submitted", "unconfirmed"]);
/** Check first, or a stop on questions, keeps the filled form open this long
 * for the next send of the job to carry on in (Browser Run's most is ten). */
const KEPT_FOR_MS = 9 * 60_000;
const FINISHED: ReadonlySet<ApplySendStatus> = new Set(["submitted", "unconfirmed", "ready", "needs_you", "blocked", "gone", "failed"]);

export class SendError extends Error {
  constructor(message: string, readonly status: 400 | 404 | 409 | 429 | 503, readonly code: string, readonly extra: Record<string, unknown> = {}) {
    super(message);
  }
}

interface SendRow {
  id: string;
  user_id: string;
  job_id: string;
  ats: "greenhouse" | "ashby";
  url: string;
  dry_run: number;
  status: ApplySendStatus;
  detail: string | null;
  needs_json: string | null;
  sent_json: string | null;
  form_shot_key: string | null;
  proof_shot_key: string | null;
  confirmation_text: string | null;
  confirmation_url: string | null;
  browser_session: string | null;
  ledger_id: string | null;
  /** How far the fill has got (migration 0105). */
  fill_done: number | null;
  fill_total: number | null;
  /** The send whose open browser this one carries on in (migration 0106). */
  continued_from: string | null;
  /** A strong match's check before it asks (migration 0109, ask-checks.ts). */
  for_ask: number;
  /** Waiting on the person (migration 0110, waiting.ts). */
  dropped_at: string | null;
  told_at: string | null;
  created_at: string;
  finished_at: string | null;
}

// ─── Queueing ────────────────────────────────────────────────────────────────

interface JobForSend extends Pick<CompanyRow, "ats_type" | "source_type" | "ats_slug"> {
  id: string;
  external_id: string;
  closed_at: string | null;
  company_id: string;
}

/**
 * Checks a job can be sent and starts its send. Never the same job twice,
 * hidden companies stay hidden, the posting must still be up (fix 6), and a
 * real send takes one of the plan's sends until it's known nothing went out.
 * `start: false` is for a send the Workflow itself was started for.
 */
export async function queueSend(
  env: Env,
  userId: string,
  input: { jobId: string; dryRun: boolean; sendId?: string; forAsk?: boolean },
  options: { start?: boolean; fetcher?: typeof fetch; now?: Date } = {},
): Promise<ApplySend> {
  const now = options.now ?? new Date();
  const sendId = input.sendId ?? crypto.randomUUID();
  const existing = await loadRow(env.DB, sendId);
  if (existing) return describeSend(env.DB, existing);
  if (!env.BROWSER || !env.RESUME_BUCKET || (options.start !== false && !env.APPLY_SEND)) {
    throw new SendError("Sending isn't set up here.", 503, "sends_unavailable");
  }

  const job = await env.DB.prepare(
    `SELECT j.id, j.external_id, j.closed_at, c.id AS company_id, c.ats_type, c.source_type, c.ats_slug
     FROM jobs j JOIN companies c ON c.id = j.company_id WHERE j.id = ?`
  ).bind(input.jobId).first<JobForSend>();
  if (!job) throw new SendError("Job not found.", 404, "not_found");
  const source: FormSource = { ats: getCompanySourceType(job), slug: job.ats_slug, externalId: job.external_id };
  const url = SEND_ATS.has(source.ats) ? applicationUrl(source) : null;
  if (!url) throw new SendError("Pinkslip sends Greenhouse and Ashby applications for now.", 400, "unsupported");
  if (job.closed_at) throw new SendError("This job has closed.", 409, "gone");

  const [blocked, application, sent, resume] = await Promise.all([
    env.DB.prepare("SELECT 1 AS hit FROM user_blocked_companies WHERE user_id = ? AND company_id = ?").bind(userId, job.company_id).first(),
    env.DB.prepare("SELECT stage FROM applications WHERE user_id = ? AND job_id = ?").bind(userId, job.id).first<{ stage: string }>(),
    env.DB.prepare(
      `SELECT id FROM apply_sends WHERE user_id = ? AND job_id = ? AND dry_run = 0
       AND status IN ('queued', 'running', 'submitting', 'code_needed', 'submitted', 'unconfirmed') LIMIT 1`
    ).bind(userId, job.id).first(),
    env.RESUME_BUCKET.head(applyResumeKey(userId)),
  ]);
  if (blocked) throw new SendError("You hid this company.", 409, "hidden_company");
  if (!input.dryRun && application && application.stage !== "saved") throw new SendError("You already applied to this job.", 409, "already_applied");
  if (!input.dryRun && sent) throw new SendError("Pinkslip already sent this application.", 409, "already_sent");
  if (!resume) throw new SendError("Upload the resume for sends first.", 409, "no_resume");

  // The catalog can list a posting that's gone (Cursor's, in phase 0).
  const form = await fetchApplicationForm(source, options.fetcher).catch(() => undefined);
  if (form === null) throw new SendError("This posting is gone.", 409, "gone");

  let ledgerId: string | null = null;
  if (!input.dryRun) {
    const reserved = await reserveAllowance(env, userId, "auto_apply_send", job.id, now);
    if (!reserved.ok) {
      throw new SendError("You've used this plan's sends for now.", 429, "limit_reached", { limit: reserved.limit, resets_at: reserved.resets_at });
    }
    ledgerId = reserved.id;
  }
  const stamp = now.toISOString();
  const kept = await adoptKeptBrowser(env.DB, userId, job.id, now);
  try {
    await env.DB.prepare(
      `INSERT INTO apply_sends (id, user_id, job_id, ats, url, dry_run, status, ledger_id, browser_session, continued_from, for_ask, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'queued', ?, ?, ?, ?, ?, ?)`
    ).bind(sendId, userId, job.id, source.ats, url, input.dryRun ? 1 : 0, ledgerId, kept?.session ?? null, kept?.id ?? null,
      input.forAsk && input.dryRun ? 1 : 0, stamp, stamp).run();
  } catch (error) {
    if (ledgerId) await releaseAllowance(env.DB, ledgerId, now);
    if (/UNIQUE/i.test(String(error))) throw new SendError("Pinkslip already sent this application.", 409, "already_sent");
    throw error;
  }
  if (options.start !== false) {
    try {
      await env.APPLY_SEND!.create({ id: sendId, params: { send_id: sendId } });
    } catch (error) {
      await finish(env, (await loadRow(env.DB, sendId))!, "failed", { detail: "The send couldn't start." }, now);
      console.error("Auto-apply send didn't start:", error instanceof Error ? error.message : String(error));
      throw new SendError("The send couldn't start. Try again.", 503, "sends_unavailable");
    }
  }
  return describeSend(env.DB, (await loadRow(env.DB, sendId))!);
}

/** `wrangler workflows trigger pinkslip-apply-send '{"email", "job", "dry_run"}'`:
 * the owner's way to send before the app has screens for it. Admins only. */
export async function queueFromTrigger(
  env: Env,
  sendId: string,
  payload: { email?: unknown; job?: unknown; dry_run?: unknown },
): Promise<{ ok: true } | { ok: false; code: string; error: string }> {
  const email = typeof payload.email === "string" ? payload.email.trim() : "";
  const user = email
    ? await env.DB.prepare(
      `SELECT u.id FROM users u JOIN auth_identities ai ON ai.user_id = u.id
       WHERE u.role = 'admin' AND (lower(ai.email) = lower(?) OR (ai.provider = 'email' AND lower(ai.provider_subject) = lower(?)))
       ORDER BY ai.last_used_at DESC LIMIT 1`
    ).bind(email, email).first<{ id: string }>()
    : null;
  if (!user) return { ok: false, code: "not_admin", error: "No admin account with that email." };
  const jobId = await jobFromLink(env.DB, typeof payload.job === "string" ? payload.job : "");
  if (!jobId) return { ok: false, code: "not_found", error: "No job matches that link or id." };
  try {
    await queueSend(env, user.id, { jobId, dryRun: payload.dry_run !== false, sendId }, { start: false });
    return { ok: true };
  } catch (error) {
    if (error instanceof SendError) return { ok: false, code: error.code, error: error.message };
    throw error;
  }
}

/** A job by its Pinkslip id or link, or by its Greenhouse or Ashby posting link. */
export async function jobFromLink(db: D1Database, link: string): Promise<string | null> {
  const value = link.trim();
  const uuid = value.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)?.[0];
  if (uuid && !/greenhouse|ashbyhq/i.test(value)) {
    const alias = await db.prepare("SELECT job_id FROM job_aliases WHERE alias_id = ?").bind(uuid).first<{ job_id: string }>().catch(() => null);
    const id = alias?.job_id ?? uuid;
    return (await db.prepare("SELECT id FROM jobs WHERE id = ?").bind(id).first<{ id: string }>())?.id ?? null;
  }
  let slug: string | null = null;
  let externalId: string | null = null;
  try {
    const url = new URL(value);
    const parts = url.pathname.split("/").filter(Boolean);
    if (/greenhouse\.io$/i.test(url.hostname)) {
      slug = url.searchParams.get("for") ?? (parts[0] === "embed" ? null : parts[0]) ?? null;
      const jobs = parts.indexOf("jobs");
      externalId = url.searchParams.get("token") ?? url.searchParams.get("gh_jid") ?? (jobs >= 0 ? parts[jobs + 1] : undefined) ?? null;
    } else if (/ashbyhq\.com$/i.test(url.hostname)) {
      slug = parts[0] ?? null;
      externalId = parts[1] ?? null;
    }
  } catch {
    return null;
  }
  if (!slug || !externalId) return null;
  const row = await db.prepare(
    `SELECT j.id FROM jobs j JOIN companies c ON c.id = j.company_id
     WHERE lower(c.ats_slug) = lower(?) AND j.external_id = ? LIMIT 1`
  ).bind(slug, externalId).first<{ id: string }>();
  return row?.id ?? null;
}

/** The browser the job's last Check first or stop on questions left open,
 * taken over once: the row that kept it lets go, so its Workflow won't close
 * it, and only one send can have it. */
async function adoptKeptBrowser(db: D1Database, userId: string, jobId: string, now: Date): Promise<{ id: string; session: string } | null> {
  const kept = await db.prepare(
    `SELECT id, browser_session FROM apply_sends
     WHERE user_id = ? AND job_id = ? AND browser_session IS NOT NULL AND status IN ('needs_you', 'ready') AND finished_at > ?
     ORDER BY created_at DESC LIMIT 1`
  ).bind(userId, jobId, new Date(now.getTime() - KEPT_FOR_MS).toISOString()).first<{ id: string; browser_session: string }>();
  if (!kept) return null;
  const taken = await db.prepare("UPDATE apply_sends SET browser_session = NULL WHERE id = ? AND browser_session = ?")
    .bind(kept.id, kept.browser_session).run();
  return (taken.meta?.changes ?? 0) > 0 ? { id: kept.id, session: kept.browser_session } : null;
}

/** What the person answered and what the site read stay theirs when a send
 * carries on in a kept form: the fields it found already filled keep who
 * filled them, and the resume stays listed. */
export function carrySources(sent: SentAnswer[], before: SentAnswer[]): SentAnswer[] {
  const earlier = new Map(before.map((answer) => [`${answer.label}\u0000${answer.value}`, answer.by]));
  const carried = sent.map((answer) => {
    const by = answer.by === "page" ? earlier.get(`${answer.label}\u0000${answer.value}`) : undefined;
    return by ? { ...answer, by } : answer;
  });
  const labels = new Set(carried.map((answer) => answer.label));
  return [...carried, ...before.filter((answer) => !labels.has(answer.label) && /\.pdf$/i.test(answer.value))];
}

// ─── Running ─────────────────────────────────────────────────────────────────

export type SendStepResult = { outcome: ApplySendStatus; session_id?: string };

interface SendDeps {
  open: (binding: Fetcher, url: string) => Promise<OpenedPage>;
  reconnect: (binding: Fetcher, sessionId: string, url: string) => Promise<OpenedPage>;
  plan: (env: Env, userId: string, input: { jobId: string; controls: FormControl[] }) => Promise<ApplyPlan>;
  now: () => Date;
}

const defaultDeps: SendDeps = {
  open: openFormPage,
  reconnect: reconnectFormPage,
  plan: (env, userId, input) => planApplication(env, userId, input),
  now: () => new Date(),
};

async function loadRow(db: D1Database, sendId: string): Promise<SendRow | null> {
  return db.prepare("SELECT * FROM apply_sends WHERE id = ?").bind(sendId).first<SendRow>();
}

async function setStatus(db: D1Database, sendId: string, status: ApplySendStatus, now: Date, extra: { browser_session?: string | null; started?: boolean } = {}) {
  await db.prepare(
    `UPDATE apply_sends SET status = ?, updated_at = ?,
       started_at = CASE WHEN ? THEN COALESCE(started_at, ?) ELSE started_at END,
       browser_session = CASE WHEN ? THEN ? ELSE browser_session END
     WHERE id = ?`
  ).bind(status, now.toISOString(), extra.started ? 1 : 0, now.toISOString(),
    extra.browser_session !== undefined ? 1 : 0, extra.browser_session ?? null, sendId).run();
}

interface FinishFields {
  detail: string;
  /** The browser left open for the next send of the job (Check first, a
   * stop on questions). */
  keptSession?: string;
  needs?: SendNeed[];
  sent?: SentAnswer[];
  formShot?: string | null;
  proofShot?: string | null;
  confirmationText?: string | null;
  confirmationUrl?: string | null;
}

/** Records how a send ended. The allowance comes back unless something went
 * out (or may have), and a sent application lands in Tracker as applied. */
async function finish(env: Env, row: SendRow, status: ApplySendStatus, fields: FinishFields, now = new Date()): Promise<SendStepResult> {
  const stamp = now.toISOString();
  await env.DB.prepare(
    `UPDATE apply_sends SET status = ?, detail = ?,
       needs_json = COALESCE(?, needs_json), sent_json = COALESCE(?, sent_json),
       form_shot_key = COALESCE(?, form_shot_key), proof_shot_key = COALESCE(?, proof_shot_key),
       confirmation_text = COALESCE(?, confirmation_text), confirmation_url = COALESCE(?, confirmation_url),
       browser_session = ?, finished_at = ?, updated_at = ?
     WHERE id = ?`
  ).bind(
    status, fields.detail.slice(0, 500),
    fields.needs ? JSON.stringify(fields.needs) : null, fields.sent ? JSON.stringify(fields.sent) : null,
    fields.formShot ?? null, fields.proofShot ?? null,
    fields.confirmationText ?? null, fields.confirmationUrl ?? null,
    fields.keptSession ?? null, stamp, stamp, row.id,
  ).run();
  if (!SENT.has(status) && row.ledger_id) await releaseAllowance(env.DB, row.ledger_id, now);
  if (status === "submitted" && !row.dry_run) await trackJob(env.DB, row.user_id, row.job_id, "applied", "auto_apply");
  await skipCodePush(env.DB, row);
  await notifySend(env, row, status, fields.needs ?? [], now);
  // A stop waits for the rest of its run, so they're told about together.
  if (!row.dry_run) {
    await tellWaiting(env, row.user_id, now)
      .catch((error: unknown) => console.error("Telling about waiting sends failed:", error instanceof Error ? error.message : String(error)));
  }
  if (row.for_ask) {
    await concludeAskCheck(env, row, status, fields.needs ?? [], now)
      .catch((error: unknown) => console.error("Ask check failed:", error instanceof Error ? error.message : String(error)));
  }
  return fields.keptSession ? { outcome: status, session_id: fields.keptSession } : { outcome: status };
}

/** N13 and N14 (notification-kinds.ts): how a real send went, on the next
 * minute's tick. The code's push waits a minute, in case forwarding brings
 * the code first. */
async function notifySend(env: Env, row: SendRow, status: ApplySendStatus, needs: SendNeed[], now: Date) {
  if (row.dry_run) return;
  // Questions the sheet can take wait for tellWaiting (waiting.ts).
  if (status === "needs_you" && needs.length > 0 && needs.every(canAnswerInSheet)) return;
  const job = await env.DB.prepare(
    "SELECT j.title, c.name AS company FROM jobs j JOIN companies c ON c.id = j.company_id WHERE j.id = ?"
  ).bind(row.job_id).first<{ title: string; company: string }>();
  // Only what has a field to answer is a question; the form's own errors aren't.
  const push = applySendNotification({ status, company: job?.company ?? "Your application", title: job?.title ?? "", jobId: row.job_id, needs: needs.filter((need) => need.ref).length });
  if (!push) return;
  await scheduleNotification(env.DB, {
    userId: row.user_id,
    kind: push.kind,
    dedupeKey: `apply:${row.id}:${status}`,
    title: push.title,
    body: push.body,
    url: push.url,
    entityType: "apply_send",
    entityId: row.id,
    scheduledFor: status === "code_needed" ? new Date(now.getTime() + 60_000) : now,
  }, now).catch((error: unknown) => console.error("Auto-apply push failed:", error instanceof Error ? error.message : String(error)));
}

/** The code came, or the wait ended: its push, if it hasn't gone, never does. */
async function skipCodePush(db: D1Database, row: Pick<SendRow, "id" | "user_id">) {
  await db.prepare(
    "UPDATE notification_log SET status = 'skipped' WHERE user_id = ? AND dedupe_key = ? AND status = 'scheduled'"
  ).bind(row.user_id, `apply:${row.id}:code_needed`).run().catch(() => undefined);
}

async function saveShot(env: Env, row: SendRow, page: OpenedPage, which: "form" | "confirmation"): Promise<string | null> {
  try {
    const key = shotKey(row.user_id, row.id, which);
    await env.RESUME_BUCKET!.put(key, await page.screenshot(), { httpMetadata: { contentType: "image/jpeg" } });
    return key;
  } catch (error) {
    console.error("Auto-apply picture failed:", error instanceof Error ? error.message : String(error));
    return null;
  }
}

/** Everything on the form, and who put it there. The resume is always
 * listed: Greenhouse swaps its file input for a chip once a file is in. */
export function describeSent(controls: FormControl[], prepared: Extract<Prepared, { kind: "ready" }>, plan: Pick<ApplyPlan, "steps" | "inferred">, resumeName?: string): SentAnswer[] {
  const byPinkslip = new Set([...plan.steps.map((step) => step.ref), ...(prepared.resumeRef ? [prepared.resumeRef] : [])]);
  const byJev = new Set(plan.inferred.map((guess) => guess.ref));
  const bySite = new Set(prepared.siteFilled);
  const sent: SentAnswer[] = controls.filter((control) => !isEmpty(control)).slice(0, 150).map((control) => ({
    label: control.label.slice(0, 300),
    value: (Array.isArray(control.value) ? control.value.join(", ") : control.value ?? "").slice(0, 2_000),
    by: byJev.has(control.ref) ? "jev" : byPinkslip.has(control.ref) ? "pinkslip" : bySite.has(control.ref) ? "site" : "page",
  }));
  const resumeLabel = prepared.controls.find((control) => control.ref === prepared.resumeRef)?.label;
  if (resumeLabel && resumeName && !sent.some((answer) => answer.value === resumeName)) {
    sent.push({ label: resumeLabel.slice(0, 300), value: resumeName, by: "pinkslip" });
  }
  return sent;
}

/** Writes how far the fill has got, for the job page's button: at most once
 * a second while it goes, and always when it's done. */
function progressWriter(db: D1Database, sendId: string, now: () => Date): FillProgress {
  let last = Number.NEGATIVE_INFINITY;
  return async (done, total) => {
    const at = now().getTime();
    if (done < total && at - last < 1_000) return;
    last = at;
    await db.prepare("UPDATE apply_sends SET fill_done = ?, fill_total = ? WHERE id = ?").bind(done, total, sendId).run()
      .catch((error: unknown) => console.error("Auto-apply progress failed:", error instanceof Error ? error.message : String(error)));
  };
}

/** What the app needs to ask each question again and send. */
const needsOf = (controls: FormControl[]): SendNeed[] => controls.map((control) => ({
  ref: control.ref,
  label: control.label.slice(0, 300),
  kind: control.kind,
  options: control.options.slice(0, 200).map((option) => option.slice(0, 200)),
  required: control.required,
}));

/**
 * The browser part of a send. Safe to run again: a send that already ended
 * returns how it ended, and one that died while submitting is recorded as
 * unconfirmed rather than sent twice.
 */
export async function runSend(env: Env, sendId: string, deps: SendDeps = defaultDeps): Promise<SendStepResult> {
  const row = await loadRow(env.DB, sendId);
  if (!row) return { outcome: "failed" };
  if (FINISHED.has(row.status)) return { outcome: row.status };
  if (row.status === "code_needed") return { outcome: "code_needed", session_id: row.browser_session ?? undefined };
  if (row.status === "submitting") {
    return finish(env, row, "unconfirmed", { detail: "It stopped while submitting. Check your email before trying again." }, deps.now());
  }
  await setStatus(env.DB, sendId, "running", deps.now(), { started: true });

  // The resume's own name first ("Alip Arslan"), then the account's ("Alip").
  const person = await env.DB.prepare(
    `SELECT u.name, json_extract(p.data, '$.contact.name') AS resume_name
     FROM users u LEFT JOIN user_profiles p ON p.user_id = u.id WHERE u.id = ?`
  ).bind(row.user_id).first<{ name: string | null; resume_name: string | null }>();
  const resume = await loadResume(env.RESUME_BUCKET!, row.user_id, person?.resume_name || person?.name || "");
  if (!resume) return finish(env, row, "needs_you", { detail: "Upload the resume for sends first." }, deps.now());

  // Carry on in the form the send before left open (Check first, a stop on
  // questions), or start over when it's gone.
  const before = row.continued_from ? await loadRow(env.DB, row.continued_from) : null;
  const kept = row.continued_from && row.browser_session
    ? await deps.reconnect(env.BROWSER!, row.browser_session, row.url).catch(() => null) : null;
  const page = kept ?? await deps.open(env.BROWSER!, row.url);
  let keepBrowser = false;
  /** Leaves the filled form open for the next send of the job. */
  const keepOpen = () => {
    keepBrowser = true;
    page.detach();
    return page.sessionId;
  };
  try {
    if (page.status === 404 || page.status === 410) return finish(env, row, "gone", { detail: "The posting is gone." }, deps.now());
    if (page.blocked) return finish(env, row, "blocked", { detail: "The site showed a bot check. Finish it yourself in the app." }, deps.now());
    const prepared = kept ? await keptForm(page) : await prepareForm(page, resume);
    if (prepared.kind === "no_form") return finish(env, row, "gone", { detail: "The page had no application form." }, deps.now());

    const planned = await deps.plan(env, row.user_id, { jobId: row.job_id, controls: prepared.planning });
    // The resume went up the first time; a kept form fills only what's empty.
    const plan = kept ? { ...planned, steps: planned.steps.filter((step) => step.kind !== "file") } : planned;
    const replan = (controls: FormControl[]) => deps.plan(env, row.user_id, { jobId: row.job_id, controls });
    // A kept form's count carries on from where the send before left it.
    const write = progressWriter(env.DB, sendId, deps.now);
    const base = kept ? before?.fill_done ?? 0 : 0;
    const progress: FillProgress = (done, total) => write(base + done, base + total);
    const filled = await recheck(page, plan, prepared, resume, await fillPlan(page, plan, prepared, resume, replan, progress), replan);
    const described = describeSent(filled.controls, prepared, plan, resume.name);
    const sent = kept && before ? carrySources(described, parseList<SentAnswer>(before.sent_json)) : described;
    const formShot = await saveShot(env, row, page, "form");
    if (filled.open.length > 0 || filled.errors.length > 0) {
      const needs = [...needsOf(filled.open), ...filled.errors.map((error) => ({ label: error.slice(0, 300), kind: "error" }))];
      // The person can answer these in the app, so the form waits for them.
      const answerable = filled.errors.length === 0 && filled.open.every((control) => control.kind !== "file");
      return finish(env, row, "needs_you", {
        detail: `${needs.length === 1 ? "1 question needs" : `${needs.length} questions need`} you. Nothing was sent.`,
        // A check's form isn't held open: the ask may wait till morning.
        needs, sent, formShot, keptSession: answerable && !row.for_ask ? keepOpen() : undefined,
      }, deps.now());
    }
    if (row.dry_run) {
      return finish(env, row, "ready", {
        detail: "Everything's filled. A real send would press Submit now.", sent, formShot, keptSession: row.for_ask ? undefined : keepOpen(),
      }, deps.now());
    }

    // A send stopped while it filled ends here: Submit is never pressed.
    const going = await env.DB.prepare("UPDATE apply_sends SET status = 'submitting', updated_at = ? WHERE id = ? AND status = 'running'")
      .bind(deps.now().toISOString(), sendId).run();
    if ((going.meta?.changes ?? 0) === 0) return { outcome: (await loadRow(env.DB, sendId))?.status ?? "failed" };
    const result = await submit(page);
    if (result.status === "code_needed") {
      await setStatus(env.DB, sendId, "code_needed", deps.now(), { browser_session: page.sessionId });
      await env.DB.prepare("UPDATE apply_sends SET sent_json = ?, form_shot_key = ? WHERE id = ?").bind(JSON.stringify(sent), formShot, sendId).run();
      await notifySend(env, row, "code_needed", [], deps.now());
      keepBrowser = true;
      page.detach();
      return { outcome: "code_needed", session_id: page.sessionId };
    }
    return recordSubmit(env, row, page, result, { sent, formShot }, deps);
  } finally {
    if (!keepBrowser) await page.close();
  }
}

async function recordSubmit(
  env: Env,
  row: SendRow,
  page: OpenedPage,
  result: Awaited<ReturnType<typeof enterCode>>,
  kept: { sent?: SentAnswer[]; formShot?: string | null },
  deps: SendDeps,
): Promise<SendStepResult> {
  const now = deps.now();
  switch (result.status) {
    case "submitted":
      return finish(env, row, "submitted", {
        detail: "Sent. The confirmation page is kept.",
        ...kept,
        proofShot: await saveShot(env, row, page, "confirmation"),
        confirmationText: result.text,
        confirmationUrl: result.url,
      }, now);
    case "captcha":
      return finish(env, row, "blocked", { detail: "A captcha came up on Submit. Finish it yourself in the app; nothing was sent.", ...kept }, now);
    case "invalid":
      return finish(env, row, "needs_you", {
        detail: "The form turned the answers back. Nothing was sent.",
        needs: result.errors.slice(0, 30).map((label) => ({ label: label.slice(0, 300), kind: "unknown" })),
        ...kept,
      }, now);
    case "no_button":
      return finish(env, row, "failed", { detail: "There was no Submit button to press.", ...kept }, now);
    case "code_needed":
      return finish(env, row, "needs_you", { detail: "The code didn't work. Nothing was sent.", ...kept }, now);
    case "no_field":
    case "unknown":
      return finish(env, row, "unconfirmed", {
        detail: "Submit was pressed, but no confirmation showed. Check the picture and your email.",
        ...kept,
        proofShot: await saveShot(env, row, page, "confirmation"),
      }, now);
  }
}

/** The emailed code arrived (from email tracking or typed by the person):
 * back to the kept browser, type it, submit. */
export async function enterSendCode(env: Env, sendId: string, code: string, deps: SendDeps = defaultDeps): Promise<SendStepResult> {
  const row = await loadRow(env.DB, sendId);
  if (!row) return { outcome: "failed" };
  if (row.status !== "code_needed" || !row.browser_session) return { outcome: row.status };
  const page = await deps.reconnect(env.BROWSER!, row.browser_session, row.url);
  try {
    await setStatus(env.DB, sendId, "submitting", deps.now());
    return await recordSubmit(env, row, page, await enterCode(page, code), {}, deps);
  } finally {
    await page.close();
  }
}

/** No code came in time. Greenhouse holds the application until it's
 * entered, so nothing went out. */
export async function expireSendCode(env: Env, sendId: string, deps: SendDeps = defaultDeps): Promise<SendStepResult> {
  const row = await loadRow(env.DB, sendId);
  if (!row || row.status !== "code_needed") return { outcome: row?.status ?? "failed" };
  if (row.browser_session) {
    await deps.reconnect(env.BROWSER!, row.browser_session, row.url).then((page) => page.close()).catch(() => undefined);
  }
  return finish(env, row, "needs_you", { detail: "Greenhouse's emailed code didn't come in time. Nothing was sent." }, deps.now());
}

/** Nobody carried on in the form a send kept open: close its browser. A
 * send that took it over cleared the session first, so this leaves it be. */
export async function releaseKeptBrowser(env: Env, sendId: string, deps: SendDeps = defaultDeps): Promise<SendStepResult> {
  const row = await loadRow(env.DB, sendId);
  if (!row) return { outcome: "failed" };
  if (!row.browser_session || (row.status !== "needs_you" && row.status !== "ready")) return { outcome: row.status };
  const taken = await env.DB.prepare("UPDATE apply_sends SET browser_session = NULL WHERE id = ? AND browser_session = ?")
    .bind(row.id, row.browser_session).run();
  if ((taken.meta?.changes ?? 0) > 0) {
    await deps.reconnect(env.BROWSER!, row.browser_session, row.url).then((page) => page.close()).catch(() => undefined);
  }
  return { outcome: row.status };
}

/** The Workflow's last word when a step failed outright. */
export async function failSend(env: Env, sendId: string, message: string, now = new Date()): Promise<SendStepResult> {
  const row = await loadRow(env.DB, sendId);
  if (!row) return { outcome: "failed" };
  if (FINISHED.has(row.status)) return { outcome: row.status };
  console.error("Auto-apply send failed:", message);
  if (row.status === "submitting") {
    return finish(env, row, "unconfirmed", { detail: "It stopped while submitting. Check your email before trying again." }, now);
  }
  return finish(env, row, "failed", { detail: "Something went wrong before anything was sent." }, now);
}

// ─── Stopping ────────────────────────────────────────────────────────────────

/** Still filling or waiting on the person: a send that can be stopped. */
const STOPPABLE: ReadonlySet<ApplySendStatus> = new Set(["queued", "running", "code_needed", "needs_you", "blocked", "ready"]);
const UNDER_WAY: ReadonlySet<ApplySendStatus> = new Set(["queued", "running", "code_needed"]);

/**
 * The person stops a send (owner, 2026-11-08: there was no way to stop one
 * that was stuck or no longer wanted). One still filling, or waiting on a
 * code, ends with nothing sent and its allowance back; one waiting on
 * answers stops waiting. One already pressing Submit can't be stopped.
 */
export async function stopSend(env: Env, userId: string, sendId: string, deps: SendDeps = defaultDeps): Promise<ApplySend> {
  const row = await loadRow(env.DB, sendId);
  if (!row || row.user_id !== userId) throw new SendError("Not found.", 404, "not_found");
  if (row.status === "submitting") throw new SendError("It's already sending.", 409, "already_sending");
  if (!STOPPABLE.has(row.status) || row.dropped_at) return describeSend(env.DB, row);
  const stamp = deps.now().toISOString();
  // Only from where it was read: a send that reached Submit meanwhile goes on.
  const stopped = await env.DB.prepare(
    `UPDATE apply_sends SET
       status = CASE WHEN status IN ('queued', 'running', 'code_needed') THEN 'failed' ELSE status END,
       detail = CASE WHEN status IN ('queued', 'running', 'code_needed') THEN 'You stopped it. Nothing was sent.' ELSE detail END,
       dropped_at = ?, browser_session = NULL, finished_at = COALESCE(finished_at, ?), updated_at = ?
     WHERE id = ? AND status = ?`
  ).bind(stamp, stamp, stamp, sendId, row.status).run();
  const after = (await loadRow(env.DB, sendId))!;
  if ((stopped.meta?.changes ?? 0) === 0) {
    if (after.status === "submitting") throw new SendError("It's already sending.", 409, "already_sending");
    return describeSend(env.DB, after);
  }
  if (UNDER_WAY.has(row.status)) {
    if (row.ledger_id) await releaseAllowance(env.DB, row.ledger_id, deps.now());
    await env.APPLY_SEND?.get(sendId).then((instance) => instance.terminate()).catch(() => undefined);
  }
  if (row.browser_session) {
    await deps.reconnect(env.BROWSER!, row.browser_session, row.url).then((page) => page.close()).catch(() => undefined);
  }
  await skipCodePush(env.DB, row);
  return describeSend(env.DB, after);
}

// ─── Codes ───────────────────────────────────────────────────────────────────

/** The longest a queue of applications to one company could be held. */
const IN_LINE_FOR_MS = 20 * 60_000;

/**
 * Whether a send can start. Greenhouse's code email names the company and not
 * the job, so two applications to one company at once can't tell their codes
 * apart (owner, 2026-11-08: three to Twitch, every code to one of them). Each
 * waits until those queued before it are done, so a company only ever has one
 * code on its way. One that's been still this long has died, and holds no one.
 */
export async function sendsTurn(env: Env, sendId: string, now = new Date()): Promise<boolean> {
  const row = await loadRow(env.DB, sendId);
  if (!row || row.status !== "queued" || row.ats !== "greenhouse" || row.dry_run) return true;
  const ahead = await env.DB.prepare(
    `SELECT 1 AS hit FROM apply_sends s
     JOIN jobs theirs ON theirs.id = s.job_id
     JOIN jobs mine ON mine.id = ?
     WHERE s.user_id = ? AND s.id != ? AND s.ats = 'greenhouse' AND s.dry_run = 0
       AND theirs.company_id = mine.company_id
       AND s.status IN ('queued', 'running', 'submitting', 'code_needed')
       AND s.updated_at >= ?
       AND (s.created_at < ? OR (s.created_at = ? AND s.id < ?))
     LIMIT 1`
  ).bind(row.job_id, row.user_id, sendId, new Date(now.getTime() - IN_LINE_FOR_MS).toISOString(), row.created_at, row.created_at, sendId).first();
  return !ahead;
}

/** Greenhouse's subject, "Security code for your application to Twitch". */
export function codeEmailCompany(subject: string): string | null {
  return subject.match(/\bapplication to\s+(.+?)\s*$/i)?.[1] ?? null;
}

const companyKey = (name: string) => name.toLowerCase().replace(/\b(inc|llc|ltd|corp|corporation|co|company)\b/g, " ").replace(/[^a-z0-9]+/g, "");

function sameCompany(one: string, other: string): boolean {
  const [a, b] = [companyKey(one), companyKey(other)];
  if (!a || !b) return false;
  return a === b || (Math.min(a.length, b.length) >= 3 && (a.includes(b) || b.includes(a)));
}

/**
 * The send a code email is for: the one waiting at the company its subject
 * names. If the names differ (Greenhouse's isn't always the catalog's), the
 * only one waiting; with several and no match it goes to none of them, since
 * a wrong code ends a send, and its push asks the person.
 */
export async function sendForCodeEmail(db: D1Database, userId: string, subject: string): Promise<string | null> {
  const waiting = (await db.prepare(
    `SELECT s.id, s.status, c.name AS company FROM apply_sends s
     JOIN jobs j ON j.id = s.job_id JOIN companies c ON c.id = j.company_id
     WHERE s.user_id = ? AND s.ats = 'greenhouse' AND s.status IN ('code_needed', 'submitting')
     ORDER BY s.updated_at`
  ).bind(userId).all<{ id: string; status: string; company: string }>()).results ?? [];
  const named = codeEmailCompany(subject);
  const matching = named ? waiting.filter((send) => sameCompany(send.company, named)) : [];
  const candidates = matching.length > 0 ? matching : waiting.length === 1 ? waiting : [];
  return (candidates.find((send) => send.status === "code_needed") ?? candidates[0])?.id ?? null;
}

/** Hands a code to the person's send that's waiting for one, or about to:
 * Greenhouse emails the code the moment Submit is pressed, and forwarding
 * can bring it before the send has seen the code box. The Workflow keeps an
 * event that comes early until it waits for it (owner, 2026-11-08: the
 * forwarded code went unused and the app asked for it instead). */
export async function deliverSendCode(env: Env, userId: string, code: string, sendId?: string): Promise<boolean> {
  if (!env.APPLY_SEND) return false;
  const row = await env.DB.prepare(
    `SELECT id FROM apply_sends WHERE user_id = ? AND status IN ('code_needed', 'submitting') ${sendId ? "AND id = ?" : ""}
     ORDER BY updated_at DESC LIMIT 1`
  ).bind(...(sendId ? [userId, sendId] : [userId])).first<{ id: string }>();
  if (!row) return false;
  const instance = await env.APPLY_SEND.get(row.id);
  await instance.sendEvent({ type: "code", payload: { code } });
  await skipCodePush(env.DB, { id: row.id, user_id: userId });
  return true;
}

export async function hasSendWaitingForCode(db: D1Database, userId: string): Promise<boolean> {
  return Boolean(await db.prepare("SELECT 1 AS hit FROM apply_sends WHERE user_id = ? AND status IN ('code_needed', 'submitting') LIMIT 1").bind(userId).first());
}

/** Greenhouse's "security code" email, by its sender and subject alone. */
export function isGreenhouseCodeEmail(fromAddress: string, subject: string): boolean {
  const domain = fromAddress.toLowerCase().split("@")[1] ?? "";
  return /(^|\.)greenhouse(-mail)?\.io$/.test(domain) && /\bcode\b/i.test(subject);
}

/** The code in it. Greenhouse writes "…security code field on your
 * application: OGRULIke", and its codes can be letters only. Otherwise the
 * first word after "code" that looks like one: 6 to 10 letters and digits
 * with a digit or a capital past the first letter, outside links and not a
 * word from the subject (a company like "DoorDash"). */
export function greenhouseCode(text: string, subject = ""): string | null {
  const plain = text.replace(/https?:\/\/\S+/g, " ");
  const labelled = plain.match(/\bcode\b[^:\n]{0,80}:\s*([A-Za-z0-9]{6,12})\b/i)?.[1];
  if (labelled) return labelled;
  const fromSubject = new Set(subject.split(/[^A-Za-z0-9]+/).filter(Boolean));
  const after = plain.slice(Math.max(0, plain.search(/\bcode\b/i)));
  for (const match of after.matchAll(/\b[A-Za-z0-9]{6,10}\b/g)) {
    const token = match[0];
    if (fromSubject.has(token)) continue;
    if (/^\d+$/.test(token) && token.length > 8) continue;
    if (/\d/.test(token) || (/[A-Z]/.test(token.slice(1)) && /[a-z]/.test(token))) return token;
  }
  return null;
}

// ─── Answering what a send stopped on ────────────────────────────────────────

/**
 * The person answers the questions a send stopped on. The answers go into
 * their answers bank (where every later form finds them), and the send starts
 * again, a dry run if the first one was. `resend: false` only saves.
 */
export async function answerSend(
  env: Env,
  userId: string,
  sendId: string,
  answers: Record<string, string | string[]>,
  options: { resend?: boolean; fetcher?: typeof fetch; now?: Date } = {},
): Promise<{ saved: number; send: ApplySend | null }> {
  const row = await loadRow(env.DB, sendId);
  if (!row || row.user_id !== userId) throw new SendError("Not found.", 404, "not_found");
  if (row.status !== "needs_you") throw new SendError("That send isn't waiting on answers.", 409, "not_waiting");
  const saved = await learnAnswers(env.DB, userId, answeredControls(parseList<SendNeed>(row.needs_json), answers), options.now, { all: true });
  if (options.resend === false) return { saved, send: null };
  return { saved, send: await queueSend(env, userId, { jobId: row.job_id, dryRun: Boolean(row.dry_run) }, { fetcher: options.fetcher, now: options.now }) };
}

/** A stop's questions with the person's answers, as the controls the
 * answers bank learns from. */
function answeredControls(needs: SendNeed[], answers: Record<string, string | string[]>): FormControl[] {
  return needs.flatMap((need) => {
    const value = need.ref ? answers[need.ref] : undefined;
    if (!need.ref || need.kind === "error" || value === undefined) return [];
    return [{
      ref: need.ref,
      kind: need.kind as FormControl["kind"],
      label: need.label,
      required: need.required ?? true,
      options: need.options ?? [],
      searchable: false,
      value: Array.isArray(value) ? value.slice(0, 50).map((item) => String(item).slice(0, 500)) : String(value).slice(0, 2_000),
    }];
  });
}

/**
 * Send all (Paper "Stopped sends · Nov 4", W7): the answers kept in the
 * sheet go into the answers bank, all of them first so a GPA typed for one
 * form is there for another's choice, then each waiting send starts again
 * as a new send. One that can't start (a closed posting, the plan's sends
 * used up) says why and the rest go.
 */
export async function sendWaiting(
  env: Env,
  userId: string,
  options: { fetcher?: typeof fetch; now?: Date } = {},
): Promise<{ started: ApplySend[]; failed: Array<{ job_id: string; company: string; code: string; error: string }> }> {
  const now = options.now ?? new Date();
  const rows = await waitingRows(env.DB, userId, now);
  if (rows.length === 0) throw new SendError("Nothing is waiting on answers.", 409, "not_waiting");
  const answers = answersBySend(rows);
  if (!answers) throw new SendError("Some questions aren't answered yet.", 409, "not_answered");
  for (const row of rows) {
    await learnAnswers(env.DB, userId, answeredControls(parseNeeds(row.needs_json), answers.get(row.id) ?? {}), now, { all: true });
  }
  const started: ApplySend[] = [];
  const failed: Array<{ job_id: string; company: string; code: string; error: string }> = [];
  for (const row of rows) {
    try {
      started.push(await queueSend(env, userId, { jobId: row.job_id, dryRun: false }, { fetcher: options.fetcher, now }));
    } catch (error) {
      if (!(error instanceof SendError)) throw error;
      failed.push({ job_id: row.job_id, company: row.company, code: error.code, error: error.message });
    }
  }
  return { started, failed };
}

// ─── Reading ─────────────────────────────────────────────────────────────────

function parseList<T>(json: string | null): T[] {
  if (!json) return [];
  try {
    const value = JSON.parse(json) as unknown;
    return Array.isArray(value) ? value as T[] : [];
  } catch {
    return [];
  }
}

async function describeSend(db: D1Database, row: SendRow): Promise<ApplySend> {
  const job = await db.prepare(
    "SELECT j.title, c.name AS company FROM jobs j JOIN companies c ON c.id = j.company_id WHERE j.id = ?"
  ).bind(row.job_id).first<{ title: string; company: string }>();
  return {
    id: row.id,
    job_id: row.job_id,
    company: job?.company ?? null,
    title: job?.title ?? null,
    ats: row.ats,
    url: row.url,
    dry_run: Boolean(row.dry_run),
    status: row.status,
    detail: row.detail,
    needs: parseList(row.needs_json),
    sent: parseList(row.sent_json),
    form_shot: Boolean(row.form_shot_key),
    proof_shot: Boolean(row.proof_shot_key),
    confirmation_text: row.confirmation_text,
    confirmation_url: row.confirmation_url,
    progress: row.fill_total ? { filled: row.fill_done ?? 0, of: row.fill_total } : null,
    created_at: row.created_at,
    finished_at: row.finished_at,
    waiting_until: row.status === "needs_you" && !row.dry_run && !row.dropped_at && row.finished_at
      ? new Date(Date.parse(row.finished_at) + WAIT_MS).toISOString()
      : null,
    stopped: Boolean(row.dropped_at),
  };
}

export async function getSend(db: D1Database, userId: string, sendId: string): Promise<ApplySend | null> {
  const row = await loadRow(db, sendId);
  return row && row.user_id === userId ? describeSend(db, row) : null;
}

export async function listSends(db: D1Database, userId: string): Promise<ApplySend[]> {
  // A check before an ask isn't one of the person's sends.
  const rows = await db.prepare("SELECT * FROM apply_sends WHERE user_id = ? AND for_ask = 0 ORDER BY created_at DESC LIMIT 50").bind(userId).all<SendRow>();
  return Promise.all((rows.results ?? []).map((row) => describeSend(db, row)));
}

export async function sendShot(env: Env, userId: string, sendId: string, which: "form" | "confirmation"): Promise<R2ObjectBody | null> {
  const row = await loadRow(env.DB, sendId);
  const key = row && row.user_id === userId ? (which === "form" ? row.form_shot_key : row.proof_shot_key) : null;
  return key && env.RESUME_BUCKET ? env.RESUME_BUCKET.get(key) : null;
}
