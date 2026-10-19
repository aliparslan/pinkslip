import { normalizeEmail } from "../account";
import type { Env } from "../types";

export type ContactKind = "person" | "shared";
export type ContactEmailStatus = "unchecked" | "valid" | "catch_all" | "unknown" | "invalid" | "bounced" | "rejected" | "removed";

export interface CompanyContactRow {
  id: string;
  company_id: string;
  email: string;
  name: string;
  title: string;
  source: string;
  kind: ContactKind;
  email_status: ContactEmailStatus;
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

/** A person before a team inbox with the same kind of title: a named
 * recruiter is likelier to answer. */
function compareContacts(a: CompanyContactRow, b: CompanyContactRow): number {
  return contactRank(a.title) - contactRank(b.title)
    || Number(a.kind === "shared") - Number(b.kind === "shared")
    || a.created_at.localeCompare(b.created_at);
}

/** While OUTREACH_TEST_RECIPIENT is set, that address stands in as every
 * company's recruiter and real contacts stay hidden, so trying the flow end
 * to end never emails anyone real. */
export function outreachTestRecipient(env: Env): string | null {
  return env.OUTREACH_TEST_RECIPIENT?.trim() ? normalizeEmail(env.OUTREACH_TEST_RECIPIENT) : null;
}

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

/** Who a user may write to at a company: addresses the last check passed,
 * leaving out anyone who already heard from RECIPIENT_WEEKLY_CAP other
 * Pinkslip users this week (Decisions: Outreach #2, #3). */
export async function companyContacts(
  env: Env,
  companyId: string,
  userId: string,
  now = new Date(),
): Promise<CompanyContacts> {
  const testRecipient = outreachTestRecipient(env);
  if (testRecipient) await ensureTestContact(env, companyId, testRecipient);
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const result = await env.DB.prepare(
    `SELECT cc.id, cc.company_id, cc.email, cc.name, cc.title, cc.source, cc.kind, cc.email_status, cc.created_at,
       (
         SELECT COUNT(*) FROM outreach_threads ot
         WHERE ot.contact_id = cc.id
           AND ot.user_id != ?
           AND ot.status != 'draft'
           AND ot.created_at > ?
       ) AS recent_users
     FROM company_contacts cc
     WHERE cc.company_id = ?
       AND ${testRecipient
         ? "cc.source = 'test'"
         // An admin's test-email run makes its own contact (email/test-emails.ts).
         : "cc.email_status = 'valid' AND cc.source NOT IN ('test', 'pinkslip-test')"}`
  ).bind(userId, weekAgo, companyId).all<CompanyContactRow & { recent_users: number }>();
  const rows = result.results ?? [];
  const available = rows
    .filter((row) => row.recent_users < RECIPIENT_WEEKLY_CAP)
    .map(({ recent_users: _recent, ...row }) => row)
    .sort(compareContacts);
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

/** The suppression list's key: a SHA-256 of the normalized address. */
export async function emailHash(email: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(normalizeEmail(email)));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function isSuppressed(db: D1Database, email: string): Promise<boolean> {
  return Boolean(await db.prepare("SELECT 1 FROM contact_suppressions WHERE email_hash = ?").bind(await emailHash(email)).first());
}
