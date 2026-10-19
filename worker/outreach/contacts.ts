import { normalizeEmail } from "../account";
import type { CompanyPerson, OutreachThreadStatus } from "../../shared/outreach";
import type { Env } from "../types";

export type ContactStatus = "listed" | "hidden" | "bounced" | "removed";

export interface CompanyContactRow {
  id: string;
  company_id: string;
  email: string;
  name: string;
  title: string;
  source: string;
  status: ContactStatus;
  profile_url: string | null;
  created_at: string;
}

/** Most Pinkslip users a single recruiter hears from in a week. */
export const RECIPIENT_WEEKLY_CAP = 3;

const TITLE_RANK: Array<[RegExp, number]> = [
  [/universit|campus|early.?career|new.?grad|intern|emerging talent|student/i, 0],
  [/technical recruit|engineering recruit|tech recruit/i, 1],
  [/recruit|sourcer|talent/i, 2],
  [/people|hr\b|human resources/i, 3],
];

export function contactRank(title: string): number {
  for (const [pattern, rank] of TITLE_RANK) {
    if (pattern.test(title)) return rank;
  }
  return TITLE_RANK.length;
}

/** While OUTREACH_TEST_RECIPIENT is set, every email is addressed to it, so
 * trying outreach end to end never reaches a real recruiter. */
export function outreachTestRecipient(env: Env): string | null {
  return env.OUTREACH_TEST_RECIPIENT?.trim() ? normalizeEmail(env.OUTREACH_TEST_RECIPIENT) : null;
}

/** The stand-in recruiter, for trying a company where nobody is listed yet. */
async function ensureTestContact(env: Env, companyId: string, email: string): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO company_contacts (id, company_id, email, name, title, source, created_at)
     VALUES (?, ?, ?, '', 'Recruiter (test)', 'test', ?)
     ON CONFLICT(company_id, email) DO NOTHING`
  ).bind(crypto.randomUUID(), companyId, email, new Date().toISOString()).run();
}

export interface CompanyContacts {
  /** Best first. */
  available: CompanyContactRow[];
  /** Contacts left out because RECIPIENT_WEEKLY_CAP other users wrote to
   * them this week; the app says to try next week when nobody is left. */
  resting: number;
}

const CONTACT_COLUMNS = "cc.id, cc.company_id, cc.email, cc.name, cc.title, cc.source, cc.status, cc.profile_url, cc.created_at";

/** Who a user may write to at a company: its listed recruiters, leaving out
 * anyone who already heard from RECIPIENT_WEEKLY_CAP other Pinkslip users
 * this week (Decisions: Outreach #3). */
export async function companyContacts(
  env: Env,
  companyId: string,
  userId: string,
  now = new Date(),
): Promise<CompanyContacts> {
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const query = (where: string) => env.DB.prepare(
    `SELECT ${CONTACT_COLUMNS},
       (
         SELECT COUNT(*) FROM outreach_threads ot
         WHERE ot.contact_id = cc.id
           AND ot.user_id != ?
           AND ot.status != 'draft'
           AND ot.created_at > ?
       ) AS recent_users
     FROM company_contacts cc
     WHERE cc.company_id = ? AND ${where}`
  ).bind(userId, weekAgo, companyId).all<CompanyContactRow & { recent_users: number }>();
  // An admin's test-email run makes its own contact (email/test-emails.ts).
  let rows = (await query("cc.status = 'listed' AND cc.source NOT IN ('test', 'pinkslip-test')")).results ?? [];
  const testRecipient = outreachTestRecipient(env);
  if (rows.length === 0 && testRecipient) {
    await ensureTestContact(env, companyId, testRecipient);
    rows = (await query("cc.source = 'test'")).results ?? [];
  }
  const available = rows
    .filter((row) => row.recent_users < RECIPIENT_WEEKLY_CAP)
    .map(({ recent_users: _recent, ...row }) => row)
    .sort((a, b) => contactRank(a.title) - contactRank(b.title) || a.created_at.localeCompare(b.created_at));
  return { available, resting: rows.length - available.length };
}

/** The company's contacts a user may write to now, best first. */
export async function rankedContactsForCompany(
  env: Env,
  companyId: string,
  userId: string,
  now = new Date(),
): Promise<CompanyContactRow[]> {
  return (await companyContacts(env, companyId, userId, now)).available;
}

/**
 * A company's People (Paper O1): its listed recruiters, and anyone the user
 * already wrote to there, by name and title (addresses come with the
 * person's page). A company listed twice (two job sources) is one page, so
 * every company of the same name counts.
 */
export async function listCompanyPeople(db: D1Database, companyId: string, userId: string): Promise<CompanyPerson[]> {
  const rows = (await db.prepare(
    `SELECT cc.id, cc.name, cc.title, cc.profile_url, ot.id AS thread_id, ot.status AS thread_status,
       (SELECT om.sent_at FROM outreach_messages om WHERE om.thread_id = ot.id AND om.step = 0 AND om.status = 'sent') AS first_sent_at
     FROM company_contacts cc
     LEFT JOIN outreach_threads ot ON ot.contact_id = cc.id AND ot.user_id = ?
     WHERE cc.company_id IN (
         SELECT id FROM companies WHERE lower(name) = (SELECT lower(name) FROM companies WHERE id = ?)
       )
       AND cc.status != 'removed'
       AND cc.source != 'pinkslip-test'
       AND (ot.id IS NOT NULL OR (cc.status = 'listed' AND cc.source != 'test'))`
  ).bind(userId, companyId).all<{
    id: string;
    name: string;
    title: string;
    profile_url: string | null;
    thread_id: string | null;
    thread_status: OutreachThreadStatus | null;
    first_sent_at: string | null;
  }>()).results ?? [];
  return rows
    .map((row): CompanyPerson => ({
      id: row.id,
      name: row.name,
      title: row.title,
      linkedin_url: row.profile_url,
      thread: row.thread_id ? { id: row.thread_id, status: row.thread_status!, first_sent_at: row.first_sent_at } : null,
    }))
    .sort((a, b) => contactRank(a.title) - contactRank(b.title) || a.name.localeCompare(b.name));
}

/** The suppression list's key: a SHA-256 of the normalized address. */
export async function emailHash(email: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(normalizeEmail(email)));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function isSuppressed(db: D1Database, email: string): Promise<boolean> {
  return Boolean(await db.prepare("SELECT 1 FROM contact_suppressions WHERE email_hash = ?").bind(await emailHash(email)).first());
}

interface CandidateForContact {
  id: string;
  company_id: string;
  name: string;
  headline: string;
  current_title: string | null;
  profile_url: string;
  email_guess: string | null;
  works_there: string | null;
  actual_role: string | null;
}

/**
 * Keeps a sourced recruiter's contact in step with the owner's labels
 * (owner, 2026-10-19): "works there: yes", and not marked "not a recruiter",
 * with a guessed address, lists them on People. Anything else, or an address
 * a later search guessed differently, steps the old listing aside; it stays
 * for threads that point at it. A bounced or removed address never comes
 * back, and neither does one that asked to be left alone.
 */
export async function syncCandidateContact(db: D1Database, candidateId: string, now = new Date()): Promise<void> {
  const candidate = await db.prepare(
    `SELECT id, company_id, name, headline, current_title, profile_url, email_guess, works_there, actual_role
     FROM recruiter_candidates WHERE id = ?`
  ).bind(candidateId).first<CandidateForContact>();
  if (!candidate) return;
  const email = candidate.email_guess ? normalizeEmail(candidate.email_guess) : null;
  const listed = candidate.works_there === "yes" && candidate.actual_role !== "not_recruiter" && email !== null
    && !await isSuppressed(db, email);
  await db.prepare(
    "UPDATE company_contacts SET status = 'hidden' WHERE candidate_id = ? AND status = 'listed' AND email != ?"
  ).bind(candidate.id, listed ? email : "").run();
  if (!listed) return;
  await db.prepare(
    `INSERT INTO company_contacts (id, company_id, email, name, title, source, created_at, candidate_id, profile_url, status)
     VALUES (?, ?, ?, ?, ?, 'sourcing', ?, ?, ?, 'listed')
     ON CONFLICT(company_id, email) DO UPDATE SET
       name = excluded.name, title = excluded.title, candidate_id = excluded.candidate_id, profile_url = excluded.profile_url,
       status = CASE WHEN company_contacts.status IN ('bounced', 'removed') THEN company_contacts.status ELSE 'listed' END`
  ).bind(crypto.randomUUID(), candidate.company_id, email, candidate.name,
    candidate.current_title?.trim() || candidate.headline, now.toISOString(), candidate.id, candidate.profile_url).run();
}

/** After a company is searched again: its labelled people, and anyone
 * already listed from it, whose guessed address may have changed. */
export async function syncCompanyCandidates(db: D1Database, companyId: string, now = new Date()): Promise<void> {
  const rows = (await db.prepare(
    `SELECT id FROM recruiter_candidates
     WHERE company_id = ? AND (works_there IS NOT NULL OR id IN (SELECT candidate_id FROM company_contacts WHERE candidate_id IS NOT NULL))`
  ).bind(companyId).all<{ id: string }>()).results ?? [];
  for (const { id } of rows) await syncCandidateContact(db, id, now);
}
