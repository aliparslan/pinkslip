import { getCompanySourceType } from "../ats";
import { trackJob } from "../applications";
import { releaseAllowance, reserveAllowance } from "../plans";
import type { CompanyRow, Env } from "../types";
import type { ApplyPlan, FormControl } from "../../shared/application-form";
import type { ApplySend, ApplySendStatus, SentAnswer } from "../../shared/auto-apply";
import { applicationUrl, fetchApplicationForm, type FormSource } from "./forms";
import { planApplication } from "./plan";
import { openFormPage, reconnectFormPage, type OpenedPage } from "./browser";
import { enterCode, fillPlan, isEmpty, prepareForm, recheck, submit, type Prepared } from "./send-engine";
import { applyResumeKey, loadResume, shotKey } from "./send-files";

/**
 * Auto-apply's server sends (step 10, phase 1; docs/auto-apply-phase1-2026-10-24.md).
 * `queueSend` checks the job and the person, reserves the allowance and
 * starts the Workflow (send-workflow.ts), which runs `runSend` and, when
 * Greenhouse emails a code, `enterSendCode`. Everything a send put on the
 * form is kept, with a picture of the filled form and of the confirmation.
 */

const SEND_ATS = new Set(["greenhouse", "ashby"]);
/** Statuses where something went out, or may have: the allowance stays used. */
const SENT: ReadonlySet<ApplySendStatus> = new Set(["submitted", "unconfirmed"]);
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
  input: { jobId: string; dryRun: boolean; sendId?: string },
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
  try {
    await env.DB.prepare(
      `INSERT INTO apply_sends (id, user_id, job_id, ats, url, dry_run, status, ledger_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'queued', ?, ?, ?)`
    ).bind(sendId, userId, job.id, source.ats, url, input.dryRun ? 1 : 0, ledgerId, stamp, stamp).run();
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
  needs?: Array<{ label: string; kind: string }>;
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
       browser_session = NULL, finished_at = ?, updated_at = ?
     WHERE id = ?`
  ).bind(
    status, fields.detail.slice(0, 500),
    fields.needs ? JSON.stringify(fields.needs) : null, fields.sent ? JSON.stringify(fields.sent) : null,
    fields.formShot ?? null, fields.proofShot ?? null,
    fields.confirmationText ?? null, fields.confirmationUrl ?? null,
    stamp, stamp, row.id,
  ).run();
  if (!SENT.has(status) && row.ledger_id) await releaseAllowance(env.DB, row.ledger_id, now);
  if (status === "submitted" && !row.dry_run) await trackJob(env.DB, row.user_id, row.job_id, "applied", "auto_apply");
  return { outcome: status };
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

/** Everything on the form, and who put it there. */
export function describeSent(controls: FormControl[], prepared: Extract<Prepared, { kind: "ready" }>, plan: Pick<ApplyPlan, "steps" | "inferred">): SentAnswer[] {
  const byPinkslip = new Set([...plan.steps.map((step) => step.ref), ...(prepared.resumeRef ? [prepared.resumeRef] : [])]);
  const byJev = new Set(plan.inferred.map((guess) => guess.ref));
  const bySite = new Set(prepared.siteFilled);
  return controls.filter((control) => !isEmpty(control)).slice(0, 150).map((control) => ({
    label: control.label.slice(0, 300),
    value: (Array.isArray(control.value) ? control.value.join(", ") : control.value ?? "").slice(0, 2_000),
    by: byJev.has(control.ref) ? "jev" : byPinkslip.has(control.ref) ? "pinkslip" : bySite.has(control.ref) ? "site" : "page",
  }));
}

const needsOf = (controls: FormControl[]) => controls.map((control) => ({ label: control.label.slice(0, 300), kind: control.kind }));

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

  const person = await env.DB.prepare("SELECT name FROM users WHERE id = ?").bind(row.user_id).first<{ name: string | null }>();
  const resume = await loadResume(env.RESUME_BUCKET!, row.user_id, person?.name ?? "");
  if (!resume) return finish(env, row, "needs_you", { detail: "Upload the resume for sends first." }, deps.now());

  const page = await deps.open(env.BROWSER!, row.url);
  let keepBrowser = false;
  try {
    if (page.status === 404 || page.status === 410) return finish(env, row, "gone", { detail: "The posting is gone." }, deps.now());
    if (page.blocked) return finish(env, row, "blocked", { detail: "The site showed a bot check. Finish it on your phone." }, deps.now());
    const prepared = await prepareForm(page, resume);
    if (prepared.kind === "no_form") return finish(env, row, "gone", { detail: "The page had no application form." }, deps.now());

    const plan = await deps.plan(env, row.user_id, { jobId: row.job_id, controls: prepared.planning });
    const replan = (controls: FormControl[]) => deps.plan(env, row.user_id, { jobId: row.job_id, controls });
    const filled = await recheck(page, plan, prepared, resume, await fillPlan(page, plan, prepared, resume, replan), replan);
    const sent = describeSent(filled.controls, prepared, plan);
    const formShot = await saveShot(env, row, page, "form");
    if (filled.open.length > 0 || filled.errors.length > 0) {
      const needs = [...needsOf(filled.open), ...filled.errors.map((error) => ({ label: error.slice(0, 300), kind: "error" }))];
      return finish(env, row, "needs_you", {
        detail: `${needs.length === 1 ? "1 question needs" : `${needs.length} questions need`} you. Nothing was sent.`,
        needs, sent, formShot,
      }, deps.now());
    }
    if (row.dry_run) {
      return finish(env, row, "ready", { detail: "Everything's filled. A real send would press Submit now.", sent, formShot }, deps.now());
    }

    await setStatus(env.DB, sendId, "submitting", deps.now());
    const result = await submit(page);
    if (result.status === "code_needed") {
      await setStatus(env.DB, sendId, "code_needed", deps.now(), { browser_session: page.sessionId });
      await env.DB.prepare("UPDATE apply_sends SET sent_json = ?, form_shot_key = ? WHERE id = ?").bind(JSON.stringify(sent), formShot, sendId).run();
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
      return finish(env, row, "blocked", { detail: "A captcha came up on Submit. Finish it on your phone; nothing was sent.", ...kept }, now);
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

// ─── Codes ───────────────────────────────────────────────────────────────────

/** Hands a code to the person's send that's waiting for one. */
export async function deliverSendCode(env: Env, userId: string, code: string, sendId?: string): Promise<boolean> {
  if (!env.APPLY_SEND) return false;
  const row = await env.DB.prepare(
    `SELECT id FROM apply_sends WHERE user_id = ? AND status = 'code_needed' ${sendId ? "AND id = ?" : ""}
     ORDER BY updated_at DESC LIMIT 1`
  ).bind(...(sendId ? [userId, sendId] : [userId])).first<{ id: string }>();
  if (!row) return false;
  const instance = await env.APPLY_SEND.get(row.id);
  await instance.sendEvent({ type: "code", payload: { code } });
  return true;
}

export async function hasSendWaitingForCode(db: D1Database, userId: string): Promise<boolean> {
  return Boolean(await db.prepare("SELECT 1 AS hit FROM apply_sends WHERE user_id = ? AND status = 'code_needed' LIMIT 1").bind(userId).first());
}

/** Greenhouse's "security code" email, by its sender and subject alone. */
export function isGreenhouseCodeEmail(fromAddress: string, subject: string): boolean {
  const domain = fromAddress.toLowerCase().split("@")[1] ?? "";
  return /(^|\.)greenhouse(-mail)?\.io$/.test(domain) && /\bcode\b/i.test(subject);
}

/** The code in it: the first word after "code" that has a digit in it, 6 to
 * 10 letters and digits long, outside links. */
export function greenhouseCode(text: string): string | null {
  const plain = text.replace(/https?:\/\/\S+/g, " ");
  const after = plain.slice(Math.max(0, plain.search(/\bcode\b/i)));
  for (const match of after.matchAll(/\b[A-Za-z0-9]{6,10}\b/g)) {
    const token = match[0];
    if (!/\d/.test(token)) continue;
    if (/^\d+$/.test(token) && token.length > 8) continue;
    return token;
  }
  return null;
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
    created_at: row.created_at,
    finished_at: row.finished_at,
  };
}

export async function getSend(db: D1Database, userId: string, sendId: string): Promise<ApplySend | null> {
  const row = await loadRow(db, sendId);
  return row && row.user_id === userId ? describeSend(db, row) : null;
}

export async function listSends(db: D1Database, userId: string): Promise<ApplySend[]> {
  const rows = await db.prepare("SELECT * FROM apply_sends WHERE user_id = ? ORDER BY created_at DESC LIMIT 50").bind(userId).all<SendRow>();
  return Promise.all((rows.results ?? []).map((row) => describeSend(db, row)));
}

export async function sendShot(env: Env, userId: string, sendId: string, which: "form" | "confirmation"): Promise<R2ObjectBody | null> {
  const row = await loadRow(env.DB, sendId);
  const key = row && row.user_id === userId ? (which === "form" ? row.form_shot_key : row.proof_shot_key) : null;
  return key && env.RESUME_BUCKET ? env.RESUME_BUCKET.get(key) : null;
}
