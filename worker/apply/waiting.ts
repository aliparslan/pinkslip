import type { SendNeed, WaitingSends } from "../../shared/auto-apply";
import { DEFAULT_TIME_ZONE, localParts, validTimeZone } from "../local-time";
import { notificationLinks } from "../notification-kinds";
import { scheduleNotification } from "../notifications";
import type { Env } from "../types";
import { normalizeQuestion, resumeKeyForLabel } from "./answers";

/**
 * Sends that stopped on questions (owner, 2026-11-04, Paper "Stopped sends ·
 * Nov 4"): one push when a run's stops are in, one row on Today, one sheet
 * that asks each question once, one reminder the next morning. A stop waits
 * a day, then lapses; Don't send drops it sooner.
 *
 * Kept apart from sends.ts so finish() can tell without a cycle; Send all,
 * which starts sends, lives there.
 */

/** A stop waits this long for the person. */
export const WAIT_MS = 24 * 60 * 60_000;
/** The reminder goes at 8 where the person is, at least this long after the stop. */
const REMIND_HOUR = 8;
const REMIND_AFTER_MS = 6 * 60 * 60_000;
const TEXT_KINDS = new Set(["text", "textarea", "email", "tel", "url", "number", "combobox"]);
/** A fact that one form asks as text and another as a choice; the typed
 * answer picks the choice when the send runs again (answers.ts). */
const MERGED_FACTS = ["gpa", "graduation", "location"];

export interface WaitingRow {
  id: string;
  job_id: string;
  needs_json: string | null;
  answered_json: string | null;
  told_at: string | null;
  reminded_at: string | null;
  finished_at: string;
  company: string;
  domain: string | null;
  title: string;
}

type Answer = string | string[];

interface Member {
  sendId: string;
  company: string;
  need: SendNeed & { ref: string };
}

export interface QuestionGroup {
  id: string;
  /** Asked as the first of these; each is answered with the same value. */
  members: Member[];
  /** Choices for the same fact, filled from the typed answer. */
  merged: Member[];
}

/** Questions the sheet can take: no file, nothing the form flagged (send-facts' canAnswer). */
const answerable = (need: SendNeed): need is SendNeed & { ref: string } =>
  Boolean(need.ref) && need.kind !== "error" && need.kind !== "file";

function parseList(json: string | null): SendNeed[] {
  try {
    const value = JSON.parse(json ?? "[]") as unknown;
    return Array.isArray(value) ? value as SendNeed[] : [];
  } catch {
    return [];
  }
}

function parseAnswers(json: string | null): Record<string, Answer> {
  try {
    const value = JSON.parse(json ?? "{}") as unknown;
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, Answer> : {};
  } catch {
    return {};
  }
}

/** The person's real sends now waiting on them: each job's newest, stopped
 * on questions the sheet can take, within its day and not dropped. */
export async function waitingRows(db: D1Database, userId: string, now = new Date()): Promise<WaitingRow[]> {
  const rows = await db.prepare(
    `SELECT s.id, s.job_id, s.needs_json, s.answered_json, s.told_at, s.reminded_at, s.finished_at,
            c.name AS company, c.website AS domain, j.title
     FROM apply_sends s
     JOIN jobs j ON j.id = s.job_id
     JOIN companies c ON c.id = j.company_id
     WHERE s.user_id = ? AND s.status = 'needs_you' AND s.dry_run = 0 AND s.for_ask = 0
       AND s.dropped_at IS NULL AND s.finished_at > ?
       AND NOT EXISTS (
         SELECT 1 FROM apply_sends n
         WHERE n.user_id = s.user_id AND n.job_id = s.job_id AND n.for_ask = 0 AND n.created_at > s.created_at
       )
     ORDER BY s.finished_at DESC
     LIMIT 20`
  ).bind(userId, new Date(now.getTime() - WAIT_MS).toISOString()).all<WaitingRow>();
  return (rows.results ?? []).filter((row) => {
    const needs = parseList(row.needs_json);
    return needs.length > 0 && needs.every(answerable);
  });
}

/** What makes two questions the same one: the wording and the choices. */
function shape(need: SendNeed): string {
  const options = (need.options ?? []).map(normalizeQuestion).join("|");
  if (options) return `choice:${options}`;
  return TEXT_KINDS.has(need.kind) ? "text" : need.kind;
}

/** A short, stable id for a question, so an answer finds it again. */
function questionId(key: string): string {
  let hash = 5381;
  for (let index = 0; index < key.length; index += 1) hash = ((hash * 33) ^ key.charCodeAt(index)) >>> 0;
  return `q${hash.toString(36)}`;
}

/**
 * Each question once: the same wording with the same choices is one
 * question however many forms ask it, and a GPA, graduation date or city
 * typed for one form also answers another's choice for it.
 */
export function groupQuestions(sends: Array<{ id: string; company: string; needs: SendNeed[] }>): QuestionGroup[] {
  const groups = new Map<string, { key: string; members: Member[]; merged: Member[] }>();
  for (const send of sends) {
    for (const need of send.needs) {
      if (!answerable(need)) continue;
      const key = `${normalizeQuestion(need.label)}#${shape(need)}`;
      const member = { sendId: send.id, company: send.company, need };
      const group = groups.get(key);
      if (group) group.members.push(member);
      else groups.set(key, { key, members: [member], merged: [] });
    }
  }
  for (const fact of MERGED_FACTS) {
    const all = [...groups.values()];
    const typed = all.find((group) => shape(group.members[0]!.need) === "text" && resumeKeyForLabel(group.members[0]!.need.label) === fact);
    if (!typed) continue;
    for (const group of all) {
      const need = group.members[0]!.need;
      if (group === typed || !need.options?.length || resumeKeyForLabel(need.label) !== fact) continue;
      typed.merged.push(...group.members);
      groups.delete(group.key);
    }
  }
  return [...groups.values()].map((group) => ({ id: questionId(group.key), members: group.members, merged: group.merged }));
}

function parsed(rows: WaitingRow[]) {
  return rows.map((row) => ({ ...row, needs: parseList(row.needs_json), answers: parseAnswers(row.answered_json) }));
}

/** The waiting sends as the app shows them: the sends, each question once
 * with any answer kept so far, and when the first of them lapses. */
export function waitingView(rows: WaitingRow[]): WaitingSends | null {
  if (rows.length === 0) return null;
  const sends = parsed(rows);
  const byId = new Map(sends.map((send) => [send.id, send]));
  return {
    sends: sends.map((send) => ({ id: send.id, job_id: send.job_id, company: send.company, domain: send.domain, title: send.title })),
    questions: groupQuestions(sends).map((group) => {
      const asked = group.members[0]!;
      const companies = [...new Set([...group.members, ...group.merged].map((member) => member.company))];
      return {
        id: group.id,
        label: asked.need.label,
        kind: asked.need.kind,
        options: asked.need.options ?? [],
        companies,
        answer: byId.get(asked.sendId)?.answers[asked.need.ref] ?? null,
      };
    }),
    until: new Date(Math.min(...rows.map((row) => Date.parse(row.finished_at))) + WAIT_MS).toISOString(),
  };
}

/** "Glean, Databricks and Intercom", or the first three and how many more. */
export function companyNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  if (names.length <= 3) return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
  return `${names.slice(0, 3).join(", ")} and ${names.length - 3} more`;
}

/** The push for what's waiting (W1), or its reminder (W2): with no deadline (owner, 2026-11-04). */
export function waitingPush(view: WaitingSends, reminder: boolean): { title: string; body: string; url: string } {
  const left = view.questions.filter((question) => question.answer === null).length;
  const still = reminder ? "Still " : "";
  if (view.sends.length === 1) {
    const send = view.sends[0]!;
    const count = left <= 1 ? (reminder ? "one question" : "One question") : `${left} questions`;
    return { title: send.company, body: [`${still}${count} to finish`, send.title].filter(Boolean).join(" · "), url: notificationLinks.applySend(send.job_id) };
  }
  return {
    title: companyNames(view.sends.map((send) => send.company)),
    body: `${still}${left === 1 ? "1 question" : `${left} questions`} to finish all ${view.sends.length}`,
    url: notificationLinks.waitingSends(),
  };
}

/**
 * W1: once none of the person's sends is still going, one push for the stops
 * that came in, the rest of what's waiting with them. A stop alone keeps its
 * own push, which opens its job.
 */
export async function tellWaiting(env: Env, userId: string, now = new Date()): Promise<boolean> {
  const active = await env.DB.prepare(
    `SELECT COUNT(*) AS count FROM apply_sends
     WHERE user_id = ? AND dry_run = 0 AND for_ask = 0 AND status IN ('queued', 'running', 'submitting')`
  ).bind(userId).first<{ count: number }>();
  if ((active?.count ?? 0) > 0) return false;
  const rows = await waitingRows(env.DB, userId, now);
  const untold = rows.filter((row) => !row.told_at);
  if (untold.length === 0) return false;
  const marked = await env.DB.prepare(
    `UPDATE apply_sends SET told_at = ? WHERE told_at IS NULL AND id IN (${untold.map(() => "?").join(", ")})`
  ).bind(now.toISOString(), ...untold.map((row) => row.id)).run();
  if (!(marked.meta?.changes ?? 0)) return false;
  const push = waitingPush(waitingView(rows)!, false);
  return scheduleNotification(env.DB, {
    userId,
    kind: "apply_needs_you",
    dedupeKey: rows.length === 1 ? `apply:${rows[0]!.id}:needs_you` : `apply:waiting:${untold[0]!.id}`,
    ...push,
    entityType: "apply_send",
    entityId: untold[0]!.id,
    scheduledFor: now,
  }, now);
}

/**
 * W2, on the minute tick: at 8 where the person is, at least six hours after
 * a stop and before its day is up, one reminder for everything still
 * waiting. Nothing after it.
 */
export async function remindWaiting(env: Env, now = new Date()): Promise<number> {
  const people = await env.DB.prepare(
    `SELECT DISTINCT s.user_id, u.time_zone
     FROM apply_sends s JOIN users u ON u.id = s.user_id
     WHERE s.status = 'needs_you' AND s.dry_run = 0 AND s.for_ask = 0 AND s.dropped_at IS NULL
       AND s.told_at IS NOT NULL AND s.reminded_at IS NULL AND s.finished_at > ? AND s.finished_at <= ?
     LIMIT 200`
  ).bind(new Date(now.getTime() - WAIT_MS).toISOString(), new Date(now.getTime() - REMIND_AFTER_MS).toISOString())
    .all<{ user_id: string; time_zone: string | null }>();
  let reminded = 0;
  for (const person of people.results ?? []) {
    if (localParts(now, validTimeZone(person.time_zone, DEFAULT_TIME_ZONE)).hour !== REMIND_HOUR) continue;
    const rows = await waitingRows(env.DB, person.user_id, now);
    const due = rows.filter((row) => row.told_at && !row.reminded_at && Date.parse(row.finished_at) <= now.getTime() - REMIND_AFTER_MS);
    if (due.length === 0) continue;
    const view = waitingView(rows)!;
    // Every question answered: only Send all is left, which isn't a question.
    if (view.questions.every((question) => question.answer !== null)) continue;
    await env.DB.prepare(
      `UPDATE apply_sends SET reminded_at = ? WHERE reminded_at IS NULL AND id IN (${rows.map(() => "?").join(", ")})`
    ).bind(now.toISOString(), ...rows.map((row) => row.id)).run();
    const queued = await scheduleNotification(env.DB, {
      userId: person.user_id,
      kind: "apply_needs_you",
      dedupeKey: `apply:remind:${due[0]!.id}`,
      ...waitingPush(view, true),
      entityType: "apply_send",
      entityId: due[0]!.id,
      scheduledFor: now,
    }, now);
    if (queued) reminded += 1;
  }
  return reminded;
}

/** Keeps answers given in the sheet until Send all (W5 to W7), each on every
 * form that asks the same question. */
export async function keepWaitingAnswers(db: D1Database, userId: string, answers: Record<string, Answer>, now = new Date()): Promise<WaitingSends | null> {
  const rows = await waitingRows(db, userId, now);
  const sends = parsed(rows);
  const byId = new Map(sends.map((send) => [send.id, send]));
  const changed = new Set<string>();
  for (const group of groupQuestions(sends)) {
    const value = answers[group.id];
    if (value === undefined) continue;
    const clean = Array.isArray(value) ? value.slice(0, 50).map((item) => String(item).slice(0, 500)) : String(value).slice(0, 2_000);
    for (const member of group.members) {
      byId.get(member.sendId)!.answers[member.need.ref] = clean;
      changed.add(member.sendId);
    }
  }
  if (changed.size > 0) {
    await db.batch([...changed].map((id) =>
      db.prepare("UPDATE apply_sends SET answered_json = ?, updated_at = ? WHERE id = ?")
        .bind(JSON.stringify(byId.get(id)!.answers), now.toISOString(), id)));
  }
  return waitingView(await waitingRows(db, userId, now));
}

/** W4, Don't send: everything waiting is dropped. */
export async function dropWaiting(db: D1Database, userId: string, now = new Date()): Promise<number> {
  const rows = await waitingRows(db, userId, now);
  if (rows.length === 0) return 0;
  const result = await db.prepare(
    `UPDATE apply_sends SET dropped_at = ?, updated_at = ? WHERE user_id = ? AND id IN (${rows.map(() => "?").join(", ")})`
  ).bind(now.toISOString(), now.toISOString(), userId, ...rows.map((row) => row.id)).run();
  return result.meta?.changes ?? 0;
}

/** What each waiting send's own questions are answered with, for Send all;
 * null when a question is still unanswered. Choices filled from a typed
 * fact are left to the send's planner. */
export function answersBySend(rows: WaitingRow[]): Map<string, Record<string, Answer>> | null {
  const sends = parsed(rows);
  const byId = new Map(sends.map((send) => [send.id, send]));
  const out = new Map(sends.map((send) => [send.id, {} as Record<string, Answer>]));
  for (const group of groupQuestions(sends)) {
    const asked = group.members[0]!;
    const value = byId.get(asked.sendId)!.answers[asked.need.ref];
    if (value === undefined) return null;
    for (const member of group.members) out.get(member.sendId)![member.need.ref] = value;
  }
  return out;
}

export { answerable as canAnswerInSheet, parseList as parseNeeds };
