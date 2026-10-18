import {
  hasApplied,
  takesStageDate,
  type Application,
  type ApplicationDetail,
  type ApplicationEvent,
  type ApplicationEventSource,
  type ApplicationStage,
} from "../shared/application-stages";
import { recordActivity, stageMoveActivity } from "./activity";

/**
 * Every write to an application goes through here, so the stage, the applied
 * date and the timeline can't drift apart. Today's apps still send `saved`
 * and `applied` flags; the legacy* functions translate them into stages.
 */

interface ApplicationRow {
  id: string;
  user_id: string | null;
  job_id: string | null;
  company_name: string;
  title: string;
  url: string;
  stage: ApplicationStage;
  notes: string;
  applied_at: string | null;
  stage_changed_at: string;
  stage_date: string | null;
  created_at: string;
  updated_at: string;
  job_location: string | null;
  job_closed_at: string | null;
  company_domain: string | null;
  snapshot_domain: string | null;
  snapshot_salary: string | null;
  job_salary: string | null;
}

const APPLICATION_FIELDS = `
  a.id, a.user_id, a.job_id, a.company_name, a.title, a.url, a.stage, a.notes,
  a.applied_at, a.stage_changed_at, a.stage_date, a.created_at, a.updated_at,
  j.location AS job_location, j.closed_at AS job_closed_at, c.website AS company_domain,
  a.company_domain AS snapshot_domain, a.salary AS snapshot_salary, j.salary AS job_salary
`;

const APPLICATION_JOINS = `
  FROM applications a
  LEFT JOIN jobs j ON j.id = a.job_id
  LEFT JOIN companies c ON c.id = j.company_id
`;

/** Timestamps arrive as ISO strings from the API and as SQLite's
 * "YYYY-MM-DD HH:MM:SS" (UTC) from older rows (saved jobs, the first
 * applications), which some JavaScript engines can't parse. */
const toMillis = (value: string) =>
  Date.parse(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value) ? `${value.replace(" ", "T")}Z` : value);

/** Every timestamp leaves as ISO 8601, whichever way it was stored. */
export function isoTimestamp(value: string): string {
  const millis = toMillis(value);
  return Number.isNaN(millis) ? value : new Date(millis).toISOString();
}

function serialize(row: ApplicationRow): Application {
  return {
    id: row.id,
    job_id: row.job_id,
    company_name: row.company_name,
    title: row.title,
    url: row.url,
    stage: row.stage,
    notes: row.notes,
    applied_at: row.applied_at === null ? null : isoTimestamp(row.applied_at),
    stage_changed_at: isoTimestamp(row.stage_changed_at),
    stage_date: row.stage_date,
    created_at: isoTimestamp(row.created_at),
    updated_at: isoTimestamp(row.updated_at),
    job: row.job_id && row.job_location !== null
      ? { location: row.job_location, closed_at: row.job_closed_at, company_domain: row.company_domain ?? "" }
      : null,
    company_domain: row.company_domain || row.snapshot_domain || null,
    salary: row.job_salary ?? row.snapshot_salary ?? null,
  };
}

export async function listApplications(
  db: D1Database,
  userId: string,
  stage?: ApplicationStage
): Promise<Application[]> {
  const result = await db.prepare(
    `SELECT ${APPLICATION_FIELDS} ${APPLICATION_JOINS}
     WHERE a.user_id = ? ${stage ? "AND a.stage = ?" : ""}
     ORDER BY julianday(a.stage_changed_at) DESC, a.id DESC`
  ).bind(...(stage ? [userId, stage] : [userId])).all<ApplicationRow>();
  return (result.results ?? []).map(serialize);
}

async function findApplication(db: D1Database, userId: string, id: string): Promise<ApplicationRow | null> {
  return db.prepare(`SELECT ${APPLICATION_FIELDS} ${APPLICATION_JOINS} WHERE a.user_id = ? AND a.id = ?`)
    .bind(userId, id)
    .first<ApplicationRow>();
}

async function findApplicationForJob(db: D1Database, userId: string, jobId: string): Promise<ApplicationRow | null> {
  return db.prepare(`SELECT ${APPLICATION_FIELDS} ${APPLICATION_JOINS} WHERE a.user_id = ? AND a.job_id = ?`)
    .bind(userId, jobId)
    .first<ApplicationRow>();
}

export async function getApplicationDetail(
  db: D1Database,
  userId: string,
  id: string
): Promise<ApplicationDetail | null> {
  const row = await findApplication(db, userId, id);
  if (!row) return null;
  const events = await db.prepare(
    `SELECT e.id, e.stage, e.source, e.occurred_at, e.inbound_email_id, ie.subject AS email_subject
     FROM application_events e
     LEFT JOIN inbound_emails ie ON ie.id = e.inbound_email_id
     WHERE e.application_id = ?
     ORDER BY julianday(e.occurred_at) ASC, e.rowid ASC`
  ).bind(id).all<ApplicationEvent>();
  return {
    ...serialize(row),
    events: (events.results ?? []).map((event) => ({ ...event, occurred_at: isoTimestamp(event.occurred_at) })),
  };
}

/** A timeline entry and its twin in the Activity stream (worker/activity.ts). */
function recordEvent(
  db: D1Database,
  applicationId: string,
  stage: ApplicationStage,
  source: ApplicationEventSource,
  now: string,
  inboundEmailId: string | null = null
): D1PreparedStatement[] {
  const eventId = crypto.randomUUID();
  return [
    db.prepare(
      `INSERT INTO application_events (id, application_id, stage, source, occurred_at, inbound_email_id)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(eventId, applicationId, stage, source, now, inboundEmailId),
    stageMoveActivity(db, { eventId, applicationId, stage, source, occurredAt: now, inboundEmailId }),
  ];
}

/** Creates the job's application at `stage`, or returns null when the job is
 * gone or the user already tracks it. */
async function createApplication(
  db: D1Database,
  userId: string,
  jobId: string,
  stage: ApplicationStage,
  source: ApplicationEventSource,
  now: string,
  inboundEmailId: string | null = null
): Promise<string | null> {
  const id = crypto.randomUUID();
  const inserted = await db.prepare(
    `INSERT OR IGNORE INTO applications (
       id, user_id, job_id, company_name, title, url, stage, notes,
       applied_at, stage_changed_at, created_at, updated_at, company_domain, salary
     )
     SELECT ?, ?, j.id, c.name, j.title, COALESCE(j.url, ''), ?, '', ?, ?, ?, ?, c.website, j.salary
     FROM jobs j
     JOIN companies c ON c.id = j.company_id
     WHERE j.id = ?`
  ).bind(id, userId, stage, hasApplied(stage) ? now : null, now, now, now, jobId).run();
  if (!inserted.meta.changes) return null;
  await db.batch(recordEvent(db, id, stage, source, now, inboundEmailId));
  return id;
}

/** A new stage starts without a date; the old one's no longer applies. */
async function moveToStage(
  db: D1Database,
  application: Pick<ApplicationRow, "id" | "stage">,
  stage: ApplicationStage,
  source: ApplicationEventSource,
  now: string,
  inboundEmailId: string | null = null
): Promise<void> {
  if (application.stage === stage) return;
  await db.batch([
    db.prepare(
      `UPDATE applications
       SET stage = ?, stage_changed_at = ?, updated_at = ?, stage_date = NULL,
           applied_at = CASE WHEN ? = 'saved' THEN NULL ELSE COALESCE(applied_at, ?) END
       WHERE id = ?`
    ).bind(stage, now, now, stage, now, application.id),
    ...recordEvent(db, application.id, stage, source, now, inboundEmailId),
  ]);
}

/** Records a step an email reported. Callers decide it moves forward. */
export async function recordEmailStep(
  db: D1Database,
  application: Pick<ApplicationRow, "id" | "stage">,
  stage: ApplicationStage,
  inboundEmailId: string,
  now: string
): Promise<void> {
  await moveToStage(db, application, stage, "email", now, inboundEmailId);
}

/** Starts tracking a catalog job because an email reported a step for it. */
export async function createApplicationFromEmail(
  db: D1Database,
  userId: string,
  jobId: string,
  stage: ApplicationStage,
  inboundEmailId: string,
  now: string
): Promise<string | null> {
  return createApplication(db, userId, jobId, stage, "email", now, inboundEmailId);
}

/**
 * "Not right?": removes the steps an email recorded and puts the application
 * back where its remaining timeline leaves it. An application the email
 * created, with nothing else on its timeline, is removed.
 */
export async function undoEmailSteps(
  db: D1Database,
  applicationId: string,
  inboundEmailId: string
): Promise<"restored" | "removed"> {
  await db.prepare("DELETE FROM application_events WHERE application_id = ? AND inbound_email_id = ?")
    .bind(applicationId, inboundEmailId)
    .run();
  const remaining = await db.prepare(
    `SELECT stage, occurred_at FROM application_events
     WHERE application_id = ?
     ORDER BY julianday(occurred_at) ASC, rowid ASC`
  ).bind(applicationId).all<{ stage: ApplicationStage; occurred_at: string }>();
  const events = remaining.results ?? [];
  const last = events.at(-1);
  if (!last) {
    await deleteApplication(db, applicationId);
    return "removed";
  }
  const appliedAt = hasApplied(last.stage)
    ? events.find((event) => hasApplied(event.stage))?.occurred_at ?? last.occurred_at
    : null;
  await db.prepare(
    `UPDATE applications
     SET stage_date = CASE WHEN stage = ? THEN stage_date ELSE NULL END,
         stage = ?, stage_changed_at = ?, applied_at = ?, updated_at = ?
     WHERE id = ?`
  ).bind(last.stage, last.stage, last.occurred_at, appliedAt, new Date().toISOString(), applicationId).run();
  return "restored";
}

export async function deleteApplication(db: D1Database, id: string): Promise<void> {
  await db.batch([
    db.prepare("DELETE FROM application_events WHERE application_id = ?").bind(id),
    db.prepare("UPDATE inbound_emails SET application_id = NULL WHERE application_id = ?").bind(id),
    db.prepare("DELETE FROM applications WHERE id = ?").bind(id),
  ]);
}

/** Tracks a Pinkslip job at `stage`, creating its application if needed.
 * Null when the job doesn't exist. */
export async function trackJob(
  db: D1Database,
  userId: string,
  jobId: string,
  stage: ApplicationStage,
  source: ApplicationEventSource = "user"
): Promise<ApplicationDetail | null> {
  const now = new Date().toISOString();
  const existing = await findApplicationForJob(db, userId, jobId);
  if (existing) {
    await moveToStage(db, existing, stage, source, now);
    return getApplicationDetail(db, userId, existing.id);
  }
  await createApplication(db, userId, jobId, stage, source, now);
  const created = await findApplicationForJob(db, userId, jobId);
  return created ? getApplicationDetail(db, userId, created.id) : null;
}

/**
 * An application for a job that isn't in Pinkslip (Decisions: Application
 * dates and gaps #7): company, title, an optional link and a stage. A catalog
 * company with the same name gives it a logo.
 */
export async function createManualApplication(
  db: D1Database,
  userId: string,
  input: { company: string; title: string; url: string; stage: ApplicationStage },
  source: ApplicationEventSource = "user"
): Promise<ApplicationDetail> {
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const company = await db.prepare(
    `SELECT website FROM companies
     WHERE lower(name) = lower(?) AND website IS NOT NULL AND website != ''
     ORDER BY enabled DESC
     LIMIT 1`
  ).bind(input.company).first<{ website: string }>();
  await db.prepare(
    `INSERT INTO applications (
       id, user_id, job_id, company_name, title, url, stage, notes,
       applied_at, stage_changed_at, created_at, updated_at, company_domain, salary
     ) VALUES (?, ?, NULL, ?, ?, ?, ?, '', ?, ?, ?, ?, ?, NULL)`
  ).bind(
    id, userId, input.company, input.title, input.url, input.stage,
    hasApplied(input.stage) ? now : null, now, now, now, company?.website ?? null
  ).run();
  await db.batch(recordEvent(db, id, input.stage, source, now));
  return (await getApplicationDetail(db, userId, id))!;
}

export type EventDateUpdate =
  | { detail: ApplicationDetail }
  | { error: "not_found" | "in_future" };

/**
 * "I applied on the 2nd": moves one timeline step to when it really happened
 * (Decisions: Application dates and gaps #6), email steps included. The
 * stage stays; the applied date and when the current stage began follow the
 * timeline.
 */
export async function setEventDate(
  db: D1Database,
  userId: string,
  applicationId: string,
  eventId: string,
  occurredAt: string,
  now = new Date()
): Promise<EventDateUpdate> {
  const application = await findApplication(db, userId, applicationId);
  if (!application) return { error: "not_found" };
  // A minute of leeway for clocks a little ahead.
  if (Date.parse(occurredAt) > now.getTime() + 60_000) return { error: "in_future" };
  const changed = await db.prepare(
    "UPDATE application_events SET occurred_at = ? WHERE id = ? AND application_id = ?"
  ).bind(occurredAt, eventId, applicationId).run();
  if (!changed.meta.changes) return { error: "not_found" };
  const events = await db.prepare(
    "SELECT stage, occurred_at FROM application_events WHERE application_id = ?"
  ).bind(applicationId).all<{ stage: ApplicationStage; occurred_at: string }>();
  const timeline = (events.results ?? []).sort((a, b) => byTime(a.occurred_at, b.occurred_at));
  const appliedAt = hasApplied(application.stage)
    ? timeline.find((event) => hasApplied(event.stage))?.occurred_at ?? application.applied_at
    : null;
  const stageChangedAt = timeline.filter((event) => event.stage === application.stage).at(-1)?.occurred_at
    ?? application.stage_changed_at;
  await db.batch([
    db.prepare("UPDATE activity SET occurred_at = ? WHERE event_id = ?").bind(occurredAt, eventId),
    db.prepare("UPDATE applications SET applied_at = ?, stage_changed_at = ?, updated_at = ? WHERE id = ?")
      .bind(appliedAt, stageChangedAt, now.toISOString(), applicationId),
  ]);
  return { detail: (await getApplicationDetail(db, userId, applicationId))! };
}

export type ApplicationUpdate =
  | { detail: ApplicationDetail; previousStage: ApplicationStage }
  | { error: "not_found" | "stage_takes_no_date" };

/** Changes the stage, then its date (a stage_date with a new stage is that
 * stage's date), then the notes. */
export async function updateApplication(
  db: D1Database,
  userId: string,
  id: string,
  changes: { stage?: ApplicationStage; stage_date?: string | null; notes?: string },
  source: ApplicationEventSource = "user"
): Promise<ApplicationUpdate> {
  const existing = await findApplication(db, userId, id);
  if (!existing) return { error: "not_found" };
  const stage = changes.stage ?? existing.stage;
  if (changes.stage_date && !takesStageDate(stage)) return { error: "stage_takes_no_date" };
  const now = new Date().toISOString();
  if (changes.stage !== undefined) await moveToStage(db, existing, changes.stage, source, now);
  if (changes.stage_date !== undefined) {
    await db.prepare("UPDATE applications SET stage_date = ?, updated_at = ? WHERE id = ?")
      .bind(changes.stage_date, now, id)
      .run();
    const previousDate = changes.stage !== undefined && changes.stage !== existing.stage ? null : existing.stage_date;
    if (changes.stage_date && changes.stage_date !== previousDate) {
      await recordActivity(db, {
        userId,
        kind: "date_set",
        source,
        applicationId: id,
        jobId: existing.job_id,
        stage,
        detail: { date: changes.stage_date },
        occurredAt: now,
      });
    }
  }
  if (changes.notes !== undefined && changes.notes !== existing.notes) {
    await db.prepare("UPDATE applications SET notes = ?, updated_at = ? WHERE id = ?")
      .bind(changes.notes, now, id)
      .run();
  }
  const detail = await getApplicationDetail(db, userId, id);
  return detail ? { detail, previousStage: existing.stage } : { error: "not_found" };
}

/** `saved: true`: starts tracking at Saved. An application further along is
 * left alone. */
export async function legacySaveJob(db: D1Database, userId: string, jobId: string): Promise<void> {
  if (await findApplicationForJob(db, userId, jobId)) return;
  await createApplication(db, userId, jobId, "saved", "user", new Date().toISOString());
}

/** `saved: false`: stops tracking, but only while the job is still Saved. */
export async function legacyUnsaveJob(db: D1Database, userId: string, jobId: string): Promise<void> {
  const existing = await findApplicationForJob(db, userId, jobId);
  if (existing?.stage === "saved") await deleteApplication(db, existing.id);
}

/** `applied: true`: moves a Saved job to Applied, or starts tracking at
 * Applied. A later stage is kept; the job's snapshot is refreshed. */
export async function legacyMarkApplied(db: D1Database, userId: string, jobId: string): Promise<void> {
  const now = new Date().toISOString();
  const existing = await findApplicationForJob(db, userId, jobId);
  if (!existing) {
    await createApplication(db, userId, jobId, "applied", "user", now);
    return;
  }
  if (existing.stage === "saved") await moveToStage(db, existing, "applied", "user", now);
  await db.prepare(
    `UPDATE applications
     SET company_name = COALESCE((SELECT c.name FROM jobs j JOIN companies c ON c.id = j.company_id WHERE j.id = ?), company_name),
         title = COALESCE((SELECT title FROM jobs WHERE id = ?), title),
         url = COALESCE((SELECT url FROM jobs WHERE id = ?), url),
         company_domain = COALESCE((SELECT c.website FROM jobs j JOIN companies c ON c.id = j.company_id WHERE j.id = ?), company_domain),
         salary = COALESCE((SELECT salary FROM jobs WHERE id = ?), salary)
     WHERE id = ?`
  ).bind(jobId, jobId, jobId, jobId, jobId, existing.id).run();
}

/** `applied: false` ("I didn't apply"): a correction, not a step. Back to
 * Saved, dropping the steps recorded since, if the job was saved first;
 * otherwise the application is removed. */
export async function legacyUnmarkApplied(db: D1Database, userId: string, jobId: string): Promise<void> {
  const existing = await findApplicationForJob(db, userId, jobId);
  if (!existing || existing.stage === "saved") return;
  const saved = await db.prepare(
    `SELECT id, occurred_at AS saved_at
     FROM application_events
     WHERE application_id = ? AND stage = 'saved'
     ORDER BY julianday(occurred_at) DESC
     LIMIT 1`
  ).bind(existing.id).first<{ id: string; saved_at: string | null }>();
  if (!saved?.saved_at) {
    await deleteApplication(db, existing.id);
    return;
  }
  const now = new Date().toISOString();
  await db.batch([
    // Every step since the save, the save itself kept: a step recorded in the
    // same millisecond as the save goes too.
    db.prepare("DELETE FROM application_events WHERE application_id = ? AND id <> ? AND julianday(occurred_at) >= julianday(?)")
      .bind(existing.id, saved.id, saved.saved_at),
    db.prepare(
      `UPDATE applications
       SET stage = 'saved', applied_at = NULL, stage_date = NULL, stage_changed_at = ?, updated_at = ?
       WHERE id = ?`
    ).bind(saved.saved_at, now, existing.id),
  ]);
}

type MergeSide = Pick<
  ApplicationRow,
  "id" | "stage" | "notes" | "applied_at" | "stage_changed_at" | "created_at" | "updated_at"
> & { stage_date?: string | null };

const byTime = (a: string, b: string) => toMillis(a) - toMillis(b);
const earliest = (...values: (string | null)[]) =>
  values.filter((value): value is string => value !== null).sort(byTime)[0] ?? null;
const latest = (...values: string[]) => [...values].sort(byTime).at(-1)!;

/**
 * One application from two copies of the same job's (a guest's and the
 * account's). Applying is a fact and saving is only intent, so an applied copy
 * beats a Saved one; between two applied copies the later stage change wins.
 */
export function mergedApplicationFields(guest: MergeSide, account: MergeSide) {
  const winner = hasApplied(guest.stage) !== hasApplied(account.stage)
    ? (hasApplied(guest.stage) ? guest : account)
    : byTime(guest.stage_changed_at, account.stage_changed_at) > 0 ? guest : account;
  const notes = [account.notes, guest.notes].filter((value, index, all) => value !== "" && all.indexOf(value) === index);
  return {
    stage: winner.stage,
    notes: notes.join("\n\n"),
    applied_at: hasApplied(winner.stage) ? earliest(guest.applied_at, account.applied_at) : null,
    stage_changed_at: winner.stage_changed_at,
    stage_date: winner.stage_date ?? null,
    created_at: earliest(guest.created_at, account.created_at)!,
    updated_at: latest(guest.updated_at, account.updated_at),
  };
}

/** Folds a guest's applications for jobs the account also tracks into the
 * account's, keeping both timelines. The caller moves the rest. */
export async function mergeApplicationConflicts(
  db: D1Database,
  sourceUserId: string,
  targetUserId: string
): Promise<void> {
  const pairs = await db.prepare(
    `SELECT g.id AS guest_id, a.id AS account_id
     FROM applications g
     JOIN applications a ON a.job_id = g.job_id AND a.user_id = ?
     WHERE g.user_id = ? AND g.job_id IS NOT NULL`
  ).bind(targetUserId, sourceUserId).all<{ guest_id: string; account_id: string }>();
  for (const pair of pairs.results ?? []) {
    const [guest, account] = await Promise.all([
      db.prepare("SELECT * FROM applications WHERE id = ?").bind(pair.guest_id).first<MergeSide>(),
      db.prepare("SELECT * FROM applications WHERE id = ?").bind(pair.account_id).first<MergeSide>(),
    ]);
    if (!guest || !account) continue;
    const merged = mergedApplicationFields(guest, account);
    await db.batch([
      db.prepare("UPDATE application_events SET application_id = ? WHERE application_id = ?")
        .bind(account.id, guest.id),
      db.prepare("UPDATE activity SET application_id = ?, user_id = ? WHERE application_id = ?")
        .bind(account.id, targetUserId, guest.id),
      db.prepare("DELETE FROM applications WHERE id = ?").bind(guest.id),
      db.prepare(
        `UPDATE applications
         SET stage = ?, notes = ?, applied_at = ?, stage_changed_at = ?, stage_date = ?, created_at = ?, updated_at = ?
         WHERE id = ?`
      ).bind(
        merged.stage,
        merged.notes,
        merged.applied_at,
        merged.stage_changed_at,
        merged.stage_date,
        merged.created_at,
        merged.updated_at,
        account.id
      ),
    ]);
  }
}
