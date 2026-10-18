import { ENDING_APPLICATION_STAGES, type ApplicationStage } from "../../shared/application-stages";
import type { DetectedStage, InboundEmail, InboundEmailStatus } from "../../shared/email-tracking";
import { recordActivity } from "../activity";
import { createApplicationFromEmail, recordEmailStep, setStageDateFromEmail, undoEmailSteps } from "../applications";
import { DEFAULT_TIME_ZONE, validTimeZone } from "../local-time";
import { detectEmailDate } from "./dates";
import { companyNameHints, matchSpecific, type JobCandidate } from "./match";
import {
  atsSlugsInLink,
  compact,
  companyEvidence,
  detectStage,
  domainOf,
  isHiringService,
  type EmailContent,
  type TrackedCompany,
} from "./rules";

/*
 * What a forwarded email means for the user's applications, and the record of
 * it. The email itself is never stored: only its sender, subject, date and
 * what was detected. See docs/email-tracking.md.
 */

interface ApplicationRow {
  id: string;
  job_id: string;
  stage: ApplicationStage;
  title: string;
  company_id: string;
  company_name: string;
  website: string;
  ats_slug: string;
  external_id: string | null;
  url: string | null;
}

export type ProcessOutcome =
  /** `reason`: no step read, no company found, or no Pinkslip job it's about. */
  | { status: "ignored"; reason?: "no_step" | "no_company" | "no_job" }
  | { status: "duplicate" }
  | { status: InboundEmailStatus; emailId: string; applicationId: string | null };

const STAGE_ORDER: Record<ApplicationStage, number> = {
  saved: 0, applied: 1, assessment: 2, interview: 3, offer: 4, rejected: 5, withdrawn: 5, ghosted: 5,
};

/**
 * Emails only move an application forward or to an ending. Rejected and
 * Withdrawn are final; Ghosted isn't, since a reply means they weren't.
 */
export function emailMovesStage(current: ApplicationStage, detected: DetectedStage): boolean {
  if (current === "ghosted") return true;
  if (ENDING_APPLICATION_STAGES.includes(current)) return false;
  if (detected === "rejected") return true;
  return STAGE_ORDER[detected] > STAGE_ORDER[current];
}

export async function hashMessage(messageId: string | null, email: EmailContent): Promise<string> {
  const key = messageId?.trim() || `${email.from.address}\n${email.subject}\n${email.date ?? ""}`;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Companies the user tracks, for deciding which emails to open. */
export async function trackedCompanies(db: D1Database, userId: string): Promise<TrackedCompany[]> {
  const result = await db.prepare(
    `SELECT DISTINCT c.id, c.name, c.website, c.ats_slug
     FROM applications a
     JOIN jobs j ON j.id = a.job_id
     JOIN companies c ON c.id = j.company_id
     WHERE a.user_id = ?`
  ).bind(userId).all<TrackedCompany>();
  return result.results ?? [];
}

async function userApplications(db: D1Database, userId: string): Promise<ApplicationRow[]> {
  const result = await db.prepare(
    `SELECT a.id, a.job_id, a.stage, a.title, c.id AS company_id, c.name AS company_name, c.website, c.ats_slug,
            j.external_id, j.url
     FROM applications a
     JOIN jobs j ON j.id = a.job_id
     JOIN companies c ON c.id = j.company_id
     WHERE a.user_id = ?`
  ).bind(userId).all<ApplicationRow>();
  return result.results ?? [];
}

/** The tracked company the email is from, or null when no single company has
 * clear evidence. A mention in the body only counts for hiring-service mail. */
function resolveTrackedCompany(email: EmailContent, applications: ApplicationRow[]): string | null {
  const minimum = isHiringService(domainOf(email.from.address)) ? 1 : 3;
  const scores = new Map<string, number>();
  for (const application of applications) {
    if (scores.has(application.company_id)) continue;
    scores.set(application.company_id, companyEvidence({
      id: application.company_id,
      name: application.company_name,
      website: application.website,
      ats_slug: application.ats_slug,
    }, email));
  }
  const best = Math.max(0, ...scores.values());
  if (best < minimum) return null;
  const leaders = [...scores].filter(([, score]) => score === best);
  return leaders.length === 1 ? leaders[0]![0] : null;
}

/** A catalog company for an email about a job the user isn't tracking yet. */
async function resolveCatalogCompany(db: D1Database, email: EmailContent): Promise<TrackedCompany | null> {
  const slugs = [...new Set(email.links.flatMap(atsSlugsInLink))].slice(0, 20);
  const names = companyNameHints(email).slice(0, 10);
  if (slugs.length === 0 && names.length === 0) return null;
  const placeholders = (values: string[]) => values.map(() => "?").join(", ") || "NULL";
  const result = await db.prepare(
    `SELECT id, name, website, ats_slug FROM companies
     WHERE enabled = 1
       AND (LOWER(ats_slug) IN (${placeholders(slugs)})
         OR LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(name, ' ', ''), '.', ''), '&', ''), '-', ''), '''', '')) IN (${placeholders(names)}))`
  ).bind(...slugs, ...names).all<TrackedCompany>();
  const minimum = isHiringService(domainOf(email.from.address)) ? 1 : 3;
  const matches = (result.results ?? []).filter((company) =>
    (names.includes(compact(company.name)) || slugs.includes(company.ats_slug.toLowerCase()))
    && companyEvidence(company, email) >= minimum
  );
  return matches.length === 1 ? matches[0]! : null;
}

async function catalogJobs(db: D1Database, companyId: string): Promise<JobCandidate[]> {
  const result = await db.prepare(
    `SELECT id, title, external_id, url FROM jobs
     WHERE company_id = ?
       AND (closed_at IS NULL OR julianday(closed_at) > julianday('now', '-60 days'))
     LIMIT 3000`
  ).bind(companyId).all<JobCandidate>();
  return result.results ?? [];
}

async function insertRecord(
  db: D1Database,
  record: {
    userId: string;
    hash: string;
    email: EmailContent;
    stage: DetectedStage;
    companyId: string | null;
    status: InboundEmailStatus;
    applicationId: string | null;
    candidates: string[];
    now: string;
    detectedBy: "rules" | "ai";
    detectedDate: string | null;
  }
): Promise<string | null> {
  const id = crypto.randomUUID();
  const inserted = await db.prepare(
    `INSERT OR IGNORE INTO inbound_emails (
       id, user_id, message_hash, received_at, sender_name, sender_address, subject, sent_at,
       detected_stage, company_id, status, application_id, candidate_application_ids, created_at,
       detected_by, detected_date
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    id, record.userId, record.hash, record.now,
    record.email.from.name.slice(0, 200), record.email.from.address.slice(0, 320),
    record.email.subject.slice(0, 500), record.email.date,
    record.stage, record.companyId, record.status, record.applicationId,
    JSON.stringify(record.candidates), record.now, record.detectedBy, record.detectedDate
  ).run();
  return inserted.meta.changes ? id : null;
}

/**
 * Detects the step an email reports, finds its application and records it.
 * Emails that report no step, or that can't be tied to a Pinkslip job, leave
 * nothing behind.
 */
export async function processEmail(
  db: D1Database,
  userId: string,
  email: EmailContent,
  hash: string,
  now = new Date().toISOString(),
  /** The AI fallback for hiring mail the rules can't place (stage-reader.ts). */
  fallback?: (email: EmailContent) => Promise<DetectedStage | null>
): Promise<ProcessOutcome> {
  const ruled = detectStage(email);
  const stage = ruled ?? (fallback ? await fallback(email) : null);
  if (!stage) return { status: "ignored", reason: "no_step" };
  const detectedBy = ruled ? "rules" as const : "ai" as const;
  const zone = stage === "interview" || stage === "assessment"
    ? validTimeZone((await db.prepare("SELECT time_zone FROM users WHERE id = ?").bind(userId).first<{ time_zone: string | null }>())?.time_zone)
    : DEFAULT_TIME_ZONE;
  const detectedDate = detectEmailDate(email, stage, zone)?.value ?? null;
  const applyDate = async (applicationId: string, emailId: string) => {
    if (detectedDate) await setStageDateFromEmail(db, applicationId, stage, detectedDate, emailId, now);
  };
  const record = (status: InboundEmailStatus, companyId: string | null, applicationId: string | null, candidates: string[] = []) =>
    insertRecord(db, { userId, hash, email, stage, companyId, status, applicationId, candidates, now, detectedBy, detectedDate });

  const applications = await userApplications(db, userId);

  const startTracking = async (companyId: string, jobId: string): Promise<ProcessOutcome> => {
    const emailId = await record("created", companyId, null);
    if (!emailId) return { status: "duplicate" };
    const applicationId = await createApplicationFromEmail(db, userId, jobId, stage, emailId, now);
    if (!applicationId) {
      // Tracked in the meantime: leave a record that changed nothing.
      await db.prepare("UPDATE inbound_emails SET status = 'unchanged' WHERE id = ?").bind(emailId).run();
      return { status: "unchanged", emailId, applicationId: null };
    }
    await db.prepare("UPDATE inbound_emails SET application_id = ? WHERE id = ?").bind(applicationId, emailId).run();
    await applyDate(applicationId, emailId);
    return { status: "created", emailId, applicationId };
  };

  const moveApplication = async (application: ApplicationRow, companyId: string): Promise<ProcessOutcome> => {
    const moves = emailMovesStage(application.stage, stage);
    const emailId = await record(moves ? "applied" : "unchanged", companyId, application.id);
    if (!emailId) return { status: "duplicate" };
    if (moves) await recordEmailStep(db, application, stage, emailId, now);
    // A confirmation with the time is worth reading even when the stage is already there.
    await applyDate(application.id, emailId);
    return { status: moves ? "applied" : "unchanged", emailId, applicationId: application.id };
  };

  const askWhich = async (companyId: string, ids: string[]): Promise<ProcessOutcome> => {
    const emailId = await record("needs_choice", companyId, null, ids);
    if (!emailId) return { status: "duplicate" };
    await recordActivity(db, {
      userId,
      kind: "email_needs_choice",
      source: "email",
      inboundEmailId: emailId,
      occurredAt: now,
      dedupeKey: `email:${emailId}`,
    });
    return { status: "needs_choice", emailId, applicationId: null };
  };

  const companyId = resolveTrackedCompany(email, applications);
  if (companyId) {
    const atCompany = applications.filter((application) => application.company_id === companyId);
    // A new rejection is about an open application, not one already closed.
    const open = atCompany.filter((application) => !ENDING_APPLICATION_STAGES.includes(application.stage) || application.stage === "ghosted");
    const pool = open.length > 0 ? open : atCompany;
    const tracked = new Set(atCompany.map((application) => application.job_id));
    // The user's applications and the company's other jobs compete on job
    // links and titles, so "Software Engineer, New Grad" isn't filed under a
    // tracked "Software Engineer".
    const specific = matchSpecific(email, [
      ...pool.map((application) => ({
        id: `app:${application.id}`, title: application.title, external_id: application.external_id, url: application.url,
      })),
      ...(await catalogJobs(db, companyId))
        .filter((job) => !tracked.has(job.id))
        .map((job) => ({ ...job, id: `job:${job.id}` })),
    ]);
    const applicationFor = (key: string) => pool.find((application) => `app:${application.id}` === key)!;
    if (specific.kind === "match") {
      return specific.id.startsWith("app:")
        ? moveApplication(applicationFor(specific.id), companyId)
        : startTracking(companyId, specific.id.slice(4));
    }
    if (specific.kind === "tie") {
      const tiedApplications = specific.ids.filter((key) => key.startsWith("app:"));
      if (tiedApplications.length === 1) return moveApplication(applicationFor(tiedApplications[0]!), companyId);
      if (tiedApplications.length > 1) return askWhich(companyId, tiedApplications.map((key) => key.slice(4)));
      // Names jobs at the company, none of them the user's: not theirs to file.
      return { status: "ignored", reason: "no_job" };
    }
    // A generic email: their only application there, or ask.
    if (pool.length === 1) return moveApplication(pool[0]!, companyId);
    return askWhich(companyId, pool.map((application) => application.id));
  }

  // Not tracking anything at that company yet: start tracking the catalog job
  // the email names by link or exact title. A generic email names none.
  const company = await resolveCatalogCompany(db, email);
  if (!company) return { status: "ignored", reason: "no_company" };
  const match = matchSpecific(email, await catalogJobs(db, company.id));
  return match.kind === "match" ? startTracking(company.id, match.id) : { status: "ignored", reason: "no_job" };
}

interface InboundEmailRow {
  id: string;
  received_at: string;
  sender_name: string;
  sender_address: string;
  subject: string;
  sent_at: string | null;
  detected_stage: DetectedStage;
  status: InboundEmailStatus;
  company_name: string | null;
  company_domain: string | null;
  application_id: string | null;
  candidate_application_ids: string;
}

/** "Which application?" prompts expire after this long unanswered. */
export const NEEDS_CHOICE_TTL_DAYS = 30;

export async function listInboundEmails(
  db: D1Database,
  userId: string,
  status?: InboundEmailStatus
): Promise<InboundEmail[]> {
  const result = await db.prepare(
    `SELECT e.id, e.received_at, e.sender_name, e.sender_address, e.subject, e.sent_at, e.detected_stage,
            e.status, c.name AS company_name, c.website AS company_domain, e.application_id, e.candidate_application_ids
     FROM inbound_emails e
     LEFT JOIN companies c ON c.id = e.company_id
     WHERE e.user_id = ? ${status ? "AND e.status = ?" : ""}
     ORDER BY julianday(e.received_at) DESC, e.id DESC
     LIMIT 200`
  ).bind(...(status ? [userId, status] : [userId])).all<InboundEmailRow>();
  const rows = result.results ?? [];
  const candidateIds = [...new Set(rows.flatMap((row) => row.status === "needs_choice" ? JSON.parse(row.candidate_application_ids) as string[] : []))];
  const candidates = new Map<string, { id: string; title: string; stage: ApplicationStage }>();
  if (candidateIds.length > 0) {
    const found = await db.prepare(
      `SELECT id, title, stage FROM applications WHERE user_id = ? AND id IN (${candidateIds.map(() => "?").join(", ")})`
    ).bind(userId, ...candidateIds).all<{ id: string; title: string; stage: ApplicationStage }>();
    for (const row of found.results ?? []) candidates.set(row.id, row);
  }
  return rows.map(({ candidate_application_ids, ...row }) => ({
    ...row,
    candidates: row.status === "needs_choice"
      ? (JSON.parse(candidate_application_ids) as string[]).flatMap((id) => candidates.get(id) ?? [])
      : [],
  }));
}

async function findInboundEmail(db: D1Database, userId: string, id: string) {
  return db.prepare(
    "SELECT id, status, detected_stage, application_id, candidate_application_ids, detected_date FROM inbound_emails WHERE user_id = ? AND id = ?"
  ).bind(userId, id).first<Pick<InboundEmailRow, "id" | "status" | "detected_stage" | "application_id" | "candidate_application_ids"> & { detected_date: string | null }>();
}

export type InboundEmailAction = { ok: true } | { ok: false; status: 404 | 409 | 400; error: string };

/** Answers "Which application?" with one or more of the candidates: the
 * email files to each, moving any it moves forward. */
export async function assignInboundEmail(
  db: D1Database,
  userId: string,
  id: string,
  applicationIds: string[]
): Promise<InboundEmailAction> {
  const email = await findInboundEmail(db, userId, id);
  if (!email) return { ok: false, status: 404, error: "Not found" };
  if (email.status !== "needs_choice") return { ok: false, status: 409, error: "This email has already been sorted" };
  const chosen = [...new Set(applicationIds)];
  const candidates = JSON.parse(email.candidate_application_ids) as string[];
  if (chosen.length === 0 || chosen.some((applicationId) => !candidates.includes(applicationId))) {
    return { ok: false, status: 400, error: "Choose from the suggested applications" };
  }
  const found = await db.prepare(
    `SELECT id, stage FROM applications WHERE user_id = ? AND id IN (${chosen.map(() => "?").join(", ")})`
  ).bind(userId, ...chosen).all<{ id: string; stage: ApplicationStage }>();
  const applications = chosen.flatMap((applicationId) => (found.results ?? []).filter((row) => row.id === applicationId));
  if (applications.length !== chosen.length) return { ok: false, status: 400, error: "That application no longer exists" };
  // The email lists under the first; the rest are linked by the steps it records.
  await db.prepare(
    "UPDATE inbound_emails SET status = 'assigned', application_id = ?, candidate_application_ids = '[]' WHERE id = ?"
  ).bind(chosen[0], id).run();
  const now = new Date().toISOString();
  for (const application of applications) {
    if (emailMovesStage(application.stage, email.detected_stage)) {
      await recordEmailStep(db, application, email.detected_stage, id, now);
    }
    if (email.detected_date) {
      await setStageDateFromEmail(db, application.id, email.detected_stage, email.detected_date, id, now);
    }
  }
  return { ok: true };
}

/** "Not one of these". */
export async function dismissInboundEmail(db: D1Database, userId: string, id: string): Promise<InboundEmailAction> {
  const email = await findInboundEmail(db, userId, id);
  if (!email) return { ok: false, status: 404, error: "Not found" };
  if (email.status !== "needs_choice") return { ok: false, status: 409, error: "This email has already been sorted" };
  await db.prepare("UPDATE inbound_emails SET status = 'dismissed', candidate_application_ids = '[]' WHERE id = ?").bind(id).run();
  return { ok: true };
}

/** "Not right?": removes the steps this email recorded, on one application
 * (the page it was tapped on) or on every application it changed. */
export async function undoInboundEmail(
  db: D1Database,
  userId: string,
  id: string,
  applicationId?: string
): Promise<InboundEmailAction> {
  const email = await findInboundEmail(db, userId, id);
  if (!email) return { ok: false, status: 404, error: "Not found" };
  if (!["applied", "created", "assigned"].includes(email.status)) {
    return { ok: false, status: 409, error: "This email didn't change an application" };
  }
  const changed = await db.prepare(
    "SELECT DISTINCT application_id FROM application_events WHERE inbound_email_id = ?"
  ).bind(id).all<{ application_id: string }>();
  const linked = (changed.results ?? []).map((row) => row.application_id);
  if (applicationId !== undefined && !linked.includes(applicationId)) {
    return { ok: false, status: 409, error: "This email didn't change that application" };
  }
  const undoing = applicationId === undefined ? linked : [applicationId];
  for (const target of undoing) await undoEmailSteps(db, target, id);
  const remaining = linked.filter((target) => !undoing.includes(target));
  if (remaining.length === 0) {
    await db.prepare("UPDATE inbound_emails SET status = 'undone' WHERE id = ?").bind(id).run();
  } else if (!remaining.includes(email.application_id ?? "")) {
    await db.prepare("UPDATE inbound_emails SET application_id = ? WHERE id = ?").bind(remaining[0], id).run();
  }
  return { ok: true };
}

export async function expireNeedsChoice(db: D1Database): Promise<void> {
  await db.prepare(
    `DELETE FROM inbound_emails
     WHERE status = 'needs_choice'
       AND julianday(received_at) < julianday('now', '-${NEEDS_CHOICE_TTL_DAYS} days')`
  ).run();
}
