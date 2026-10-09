import { normalizeEmail } from "../account";
import type { Env } from "../types";

export interface CompanyContactRow {
  id: string;
  company_id: string;
  email: string;
  name: string;
  title: string;
  source: string;
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

/**
 * Real recruiter discovery isn't built yet. Until it is, OUTREACH_TEST_RECIPIENT
 * stands in as every company's recruiter so the whole flow can be tried end to
 * end without emailing anyone real.
 */
async function ensureTestContact(env: Env, companyId: string): Promise<void> {
  const email = env.OUTREACH_TEST_RECIPIENT?.trim();
  if (!email) return;
  await env.DB.prepare(
    `INSERT INTO company_contacts (id, company_id, email, name, title, source, created_at)
     VALUES (?, ?, ?, '', 'Recruiter (test)', 'test', ?)
     ON CONFLICT(company_id, email) DO NOTHING`
  ).bind(crypto.randomUUID(), companyId, normalizeEmail(email), new Date().toISOString()).run();
}

/** The company's contacts, best first, leaving out anyone who already heard
 * from RECIPIENT_WEEKLY_CAP other Pinkslip users this week. */
export async function rankedContactsForCompany(
  env: Env,
  companyId: string,
  userId: string,
  now = new Date(),
): Promise<CompanyContactRow[]> {
  await ensureTestContact(env, companyId);
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const result = await env.DB.prepare(
    `SELECT cc.id, cc.company_id, cc.email, cc.name, cc.title, cc.source, cc.created_at
     FROM company_contacts cc
     WHERE cc.company_id = ?
       AND (
         SELECT COUNT(*) FROM outreach_threads ot
         WHERE ot.contact_id = cc.id
           AND ot.user_id != ?
           AND ot.status != 'draft'
           AND ot.created_at > ?
       ) < ?`
  ).bind(companyId, userId, weekAgo, RECIPIENT_WEEKLY_CAP).all<CompanyContactRow>();
  return (result.results ?? []).sort(
    (a, b) => contactRank(a.title) - contactRank(b.title) || a.created_at.localeCompare(b.created_at),
  );
}
