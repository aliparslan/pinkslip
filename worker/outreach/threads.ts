import { getUserProfile } from "../account";
import type { Env } from "../types";
import type {
  OutreachMessage,
  OutreachMessageStatus,
  OutreachStep,
  OutreachThread,
  OutreachThreadStatus,
} from "../../shared/outreach";
import { rankedContactsForCompany } from "./contacts";
import { draftOutreachSequence } from "./drafts";
import { followUpDueAt, testFollowUpMinutes, validTimeZone } from "./schedule";

export class OutreachError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 404 | 409,
    readonly code: string,
  ) {
    super(message);
  }
}

interface ThreadRow {
  id: string;
  status: OutreachThreadStatus;
  job_id: string | null;
  job_title: string | null;
  company_id: string;
  company_name: string;
  contact_name: string;
  contact_email: string;
  contact_title: string;
  contact_source: string;
  time_zone: string;
  created_at: string;
  updated_at: string;
}

interface MessageRow {
  id: string;
  thread_id: string;
  step: OutreachStep;
  subject: string;
  body: string;
  status: OutreachMessageStatus;
  due_at: string | null;
  sent_at: string | null;
}

const THREAD_SELECT = `
  SELECT ot.id, ot.status, ot.job_id, j.title AS job_title, ot.company_id,
         c.name AS company_name, cc.name AS contact_name, cc.email AS contact_email,
         cc.title AS contact_title, cc.source AS contact_source, ot.time_zone,
         ot.created_at, ot.updated_at
  FROM outreach_threads ot
  JOIN companies c ON c.id = ot.company_id
  JOIN company_contacts cc ON cc.id = ot.contact_id
  LEFT JOIN jobs j ON j.id = ot.job_id`;

function toThread(row: ThreadRow, messages: MessageRow[]): OutreachThread {
  return {
    id: row.id,
    status: row.status,
    job_id: row.job_id,
    job_title: row.job_title,
    company_id: row.company_id,
    company_name: row.company_name,
    contact: {
      name: row.contact_name,
      email: row.contact_email,
      title: row.contact_title,
      test: row.contact_source === "test",
    },
    messages: messages
      .filter((message) => message.thread_id === row.id)
      .sort((a, b) => a.step - b.step)
      .map((message): OutreachMessage => ({
        id: message.id,
        step: message.step,
        subject: message.subject,
        body: message.body,
        status: message.status,
        due_at: message.due_at,
        sent_at: message.sent_at,
      })),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function withMessages(db: D1Database, rows: ThreadRow[]): Promise<OutreachThread[]> {
  if (rows.length === 0) return [];
  const placeholders = rows.map(() => "?").join(", ");
  const messages = await db.prepare(
    `SELECT id, thread_id, step, subject, body, status, due_at, sent_at
     FROM outreach_messages
     WHERE thread_id IN (${placeholders})`
  ).bind(...rows.map((row) => row.id)).all<MessageRow>();
  return rows.map((row) => toThread(row, messages.results ?? []));
}

export async function listThreads(
  db: D1Database,
  userId: string,
  filter: { jobId?: string } = {},
): Promise<OutreachThread[]> {
  const rows = filter.jobId
    ? await db.prepare(
      `${THREAD_SELECT}
       WHERE ot.user_id = ? AND ot.job_id = ?
       ORDER BY ot.updated_at DESC`
    ).bind(userId, filter.jobId).all<ThreadRow>()
    : await db.prepare(
      `${THREAD_SELECT}
       WHERE ot.user_id = ?
       ORDER BY ot.updated_at DESC
       LIMIT 200`
    ).bind(userId).all<ThreadRow>();
  return withMessages(db, rows.results ?? []);
}

export async function loadThread(
  db: D1Database,
  userId: string,
  threadId: string,
): Promise<OutreachThread | null> {
  const row = await db.prepare(`${THREAD_SELECT} WHERE ot.id = ? AND ot.user_id = ?`)
    .bind(threadId, userId)
    .first<ThreadRow>();
  if (!row) return null;
  return (await withMessages(db, [row]))[0];
}

/** Starts an email to the company's best available recruiter, or returns the
 * thread the user already has with that recruiter. */
export async function startThreadForJob(
  env: Env,
  userId: string,
  jobId: string,
  now = new Date(),
): Promise<OutreachThread> {
  const job = await env.DB.prepare(
    `SELECT j.id, j.title, j.company_id, c.name AS company_name
     FROM jobs j JOIN companies c ON c.id = j.company_id
     WHERE j.id = ?`
  ).bind(jobId).first<{ id: string; title: string; company_id: string; company_name: string }>();
  if (!job) throw new OutreachError("Job not found", 404, "not_found");

  const contacts = await rankedContactsForCompany(env, job.company_id, userId, now);
  if (contacts.length === 0) {
    throw new OutreachError("No recruiter found for this company yet.", 404, "no_contacts");
  }

  const existing = await env.DB.prepare(
    `SELECT id FROM outreach_threads
     WHERE user_id = ? AND contact_id IN (${contacts.map(() => "?").join(", ")})
     ORDER BY created_at ASC LIMIT 1`
  ).bind(userId, ...contacts.map((contact) => contact.id)).first<{ id: string }>();
  if (existing) return (await loadThread(env.DB, userId, existing.id))!;

  const contact = contacts[0];
  const [profile, user] = await Promise.all([
    getUserProfile(env.DB, userId),
    env.DB.prepare("SELECT name FROM users WHERE id = ?").bind(userId).first<{ name: string }>(),
  ]);
  const drafts = draftOutreachSequence({
    profile: profile.data,
    accountName: user?.name ?? "",
    contactName: contact.name,
    jobTitle: job.title,
    companyName: job.company_name,
    now,
  });

  const threadId = crypto.randomUUID();
  const stamp = now.toISOString();
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO outreach_threads (id, user_id, company_id, job_id, contact_id, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'draft', ?, ?)`
    ).bind(threadId, userId, job.company_id, job.id, contact.id, stamp, stamp),
    ...drafts.map((draft) => env.DB.prepare(
      `INSERT INTO outreach_messages (id, thread_id, step, subject, body, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'draft', ?, ?)`
    ).bind(crypto.randomUUID(), threadId, draft.step, draft.subject, draft.body, stamp, stamp)),
  ]);
  return (await loadThread(env.DB, userId, threadId))!;
}

async function ownedMessage(db: D1Database, userId: string, messageId: string) {
  const row = await db.prepare(
    `SELECT om.id, om.thread_id, om.step, om.status, ot.status AS thread_status, ot.time_zone
     FROM outreach_messages om
     JOIN outreach_threads ot ON ot.id = om.thread_id
     WHERE om.id = ? AND ot.user_id = ?`
  ).bind(messageId, userId).first<{
    id: string;
    thread_id: string;
    step: OutreachStep;
    status: OutreachMessageStatus;
    thread_status: OutreachThreadStatus;
    time_zone: string;
  }>();
  if (!row) throw new OutreachError("Message not found", 404, "not_found");
  return row;
}

export async function editMessage(
  db: D1Database,
  userId: string,
  messageId: string,
  changes: { subject?: string; body?: string },
  now = new Date(),
): Promise<OutreachThread> {
  const message = await ownedMessage(db, userId, messageId);
  if (message.status === "sent" || message.status === "skipped") {
    throw new OutreachError("This email can't be edited anymore.", 409, "message_closed");
  }
  const subject = changes.subject?.trim();
  const body = changes.body?.trim();
  if (subject === "" || body === "") {
    throw new OutreachError("Subject and message can't be empty.", 400, "invalid_message");
  }
  await db.prepare(
    `UPDATE outreach_messages
     SET subject = COALESCE(?, subject), body = COALESCE(?, body), updated_at = ?
     WHERE id = ?`
  ).bind(subject ?? null, body ?? null, now.toISOString(), messageId).run();
  return (await loadThread(db, userId, message.thread_id))!;
}

/** Records that the user sent a message from their mail app, then schedules
 * the next follow-up, or finishes the thread after the last one. */
export async function markMessageSent(
  env: Env,
  userId: string,
  messageId: string,
  timeZone: unknown,
  now = new Date(),
): Promise<OutreachThread> {
  const message = await ownedMessage(env.DB, userId, messageId);
  if (message.status === "sent") return (await loadThread(env.DB, userId, message.thread_id))!;
  if (message.status === "skipped" || (message.thread_status !== "draft" && message.thread_status !== "active")) {
    throw new OutreachError("This thread is closed.", 409, "thread_closed");
  }
  const previous = message.step === 0
    ? null
    : await env.DB.prepare(
      "SELECT status FROM outreach_messages WHERE thread_id = ? AND step = ?"
    ).bind(message.thread_id, message.step - 1).first<{ status: OutreachMessageStatus }>();
  if (previous && previous.status !== "sent") {
    throw new OutreachError("Send the earlier email first.", 409, "out_of_order");
  }

  const zone = message.step === 0 ? validTimeZone(timeZone) : message.time_zone;
  const stamp = now.toISOString();
  const nextStep = message.step + 1;
  const statements = [
    env.DB.prepare(
      `UPDATE outreach_messages SET status = 'sent', sent_at = ?, due_at = NULL, updated_at = ? WHERE id = ?`
    ).bind(stamp, stamp, messageId),
    env.DB.prepare(
      `UPDATE outreach_threads SET status = ?, time_zone = ?, updated_at = ? WHERE id = ?`
    ).bind(nextStep > 2 ? "finished" : "active", zone, stamp, message.thread_id),
  ];
  if (nextStep <= 2) {
    const dueAt = followUpDueAt(
      now,
      nextStep as 1 | 2,
      zone,
      testFollowUpMinutes(env.OUTREACH_FOLLOW_UP_MINUTES),
    );
    statements.push(env.DB.prepare(
      `UPDATE outreach_messages
       SET status = 'scheduled', due_at = ?, reminded_at = NULL, updated_at = ?
       WHERE thread_id = ? AND step = ? AND status = 'draft'`
    ).bind(dueAt.toISOString(), stamp, message.thread_id, nextStep));
  }
  await env.DB.batch(statements);
  return (await loadThread(env.DB, userId, message.thread_id))!;
}

/** Ends the sequence: the recruiter replied, or the user stopped it. */
export async function closeThread(
  db: D1Database,
  userId: string,
  threadId: string,
  status: "replied" | "stopped",
  now = new Date(),
): Promise<OutreachThread> {
  const thread = await loadThread(db, userId, threadId);
  if (!thread) throw new OutreachError("Thread not found", 404, "not_found");
  const stamp = now.toISOString();
  await db.batch([
    db.prepare(`UPDATE outreach_threads SET status = ?, updated_at = ? WHERE id = ?`)
      .bind(status, stamp, threadId),
    db.prepare(
      `UPDATE outreach_messages SET status = 'skipped', due_at = NULL, updated_at = ?
       WHERE thread_id = ? AND status IN ('draft', 'scheduled')`
    ).bind(stamp, threadId),
  ]);
  return (await loadThread(db, userId, threadId))!;
}

/** Throws away a thread that never sent anything. */
export async function discardDraftThread(db: D1Database, userId: string, threadId: string): Promise<void> {
  const thread = await loadThread(db, userId, threadId);
  if (!thread) throw new OutreachError("Thread not found", 404, "not_found");
  if (thread.status !== "draft") {
    throw new OutreachError("Only unsent drafts can be discarded.", 409, "thread_started");
  }
  await db.batch([
    db.prepare("DELETE FROM outreach_messages WHERE thread_id = ?").bind(threadId),
    db.prepare("DELETE FROM outreach_threads WHERE id = ? AND user_id = ?").bind(threadId, userId),
  ]);
}
