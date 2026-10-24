import { normalizeEmail } from "../account";
import type { CompanyPerson, OutreachThreadStatus } from "../../shared/outreach";
import {
  listable,
  recruiterTypes,
  type ActualRole,
  type RecruiterField,
  type RecruiterJob,
  type RecruiterLevel,
  type RecruiterTypes,
} from "../../shared/recruiter-review";
import { DEFAULT_SEARCH_PROFILE, normalizeSearchProfile } from "../../shared/search-profile";
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

/** Who's looking, in recruiters' terms: the levels and fields they search for. */
export interface Seeker {
  levels: RecruiterLevel[];
  fields: RecruiterField[];
}

const STAGE_LEVEL: Record<string, RecruiterLevel> = {
  internship: "interns",
  new_grad: "new_grads",
  early_career: "experienced",
  mid_career: "experienced",
};

/** From the person's job preferences; every role Pinkslip lists is
 * technical, and research roles go to research recruiters too. */
export async function seekerFor(db: D1Database, userId: string): Promise<Seeker> {
  const row = await db.prepare("SELECT profile_json FROM user_search_profiles WHERE user_id = ?")
    .bind(userId).first<{ profile_json: string }>().catch(() => null);
  let profile = DEFAULT_SEARCH_PROFILE;
  try {
    if (row) profile = normalizeSearchProfile(JSON.parse(row.profile_json));
  } catch {
    // A corrupt profile reads as the default.
  }
  const levels = [...new Set(profile.target_levels.map((stage) => STAGE_LEVEL[stage]).filter(Boolean))] as RecruiterLevel[];
  const fields: RecruiterField[] = profile.roles.includes("research") ? ["engineering", "research"] : ["engineering"];
  return { levels: levels.length > 0 ? levels : ["new_grads"], fields };
}

const JOB_ORDER: Record<RecruiterJob, number> = {
  recruiter: 0, sourcer: 0, coordinator: 1, programs: 1, leads: 1, not_recruiting: 2,
};

/** Lower comes first (Decided, recruiter types): someone who hires the
 * person's level, then their field, then recruiters and sourcers ahead of
 * coordinators, programs and leaders. */
export function recruiterScore(types: RecruiterTypes, seeker: Seeker): number {
  const level = types.hires.some((hires) => seeker.levels.includes(hires)) ? 0 : 1;
  const field = types.hires_for.includes("everything") || types.hires_for.some((hiresFor) => seeker.fields.includes(hiresFor)) ? 0 : 1;
  return level * 4 + field * 2 + JOB_ORDER[types.job];
}

/** A contact's types: its sourced candidate's, or the title's suggestion for
 * one that came from elsewhere. */
interface TypedRow {
  title: string;
  rc_title: string | null;
  rc_headline: string | null;
  hires: string | null;
  hires_for: string | null;
  job: RecruiterJob | null;
  agency: number | null;
  actual_role: ActualRole | null;
}

function typesOf(row: TypedRow): RecruiterTypes {
  return recruiterTypes({
    current_title: row.rc_title ?? row.title,
    headline: row.rc_headline ?? row.title,
    hires: row.hires,
    hires_for: row.hires_for,
    job: row.job,
    agency: row.agency,
    actual_role: row.actual_role,
  }).types;
}

const TYPE_COLUMNS = "rc.current_title AS rc_title, rc.headline AS rc_headline, rc.hires, rc.hires_for, rc.job, rc.agency, rc.actual_role";

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
    `SELECT ${CONTACT_COLUMNS}, ${TYPE_COLUMNS},
       (
         SELECT COUNT(*) FROM outreach_threads ot
         WHERE ot.contact_id = cc.id
           AND ot.user_id != ?
           AND ot.status != 'draft'
           AND ot.created_at > ?
       ) AS recent_users
     FROM company_contacts cc
     LEFT JOIN recruiter_candidates rc ON rc.id = cc.candidate_id
     WHERE cc.company_id = ? AND ${where}`
  ).bind(userId, weekAgo, companyId).all<CompanyContactRow & TypedRow & { recent_users: number }>();
  // An admin's test-email run makes its own contact (email/test-emails.ts).
  let rows = (await query("cc.status = 'listed' AND cc.source NOT IN ('test', 'pinkslip-test')")).results ?? [];
  const testRecipient = outreachTestRecipient(env);
  if (rows.length === 0 && testRecipient) {
    await ensureTestContact(env, companyId, testRecipient);
    rows = (await query("cc.source = 'test'")).results ?? [];
  }
  const seeker = await seekerFor(env.DB, userId);
  const scored = rows
    .map((row) => ({ row, types: typesOf(row) }))
    // The test stand-in is for trying it out, whatever its title says.
    .filter(({ row, types }) => row.source === "test" || listable(types));
  const available = scored
    .filter(({ row }) => row.recent_users < RECIPIENT_WEEKLY_CAP)
    .sort((a, b) => recruiterScore(a.types, seeker) - recruiterScore(b.types, seeker)
      || contactRank(a.row.title) - contactRank(b.row.title) || a.row.created_at.localeCompare(b.row.created_at))
    .map(({ row }): CompanyContactRow => ({
      id: row.id, company_id: row.company_id, email: row.email, name: row.name, title: row.title,
      source: row.source, status: row.status, profile_url: row.profile_url, created_at: row.created_at,
    }));
  return { available, resting: scored.length - available.length };
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

/** Companies listed twice (two job sources) are one page: every company of
 * the same name counts. */
const SAME_COMPANY = "SELECT id FROM companies WHERE lower(name) = (SELECT lower(name) FROM companies WHERE id = ?)";

/**
 * A company's People (Paper O1): its listed recruiters, and anyone the user
 * already wrote to there, by name and title (addresses come with the
 * person's page). Recruiters who aren't in recruiting or came through an
 * agency aren't listed; the rest come in the order that suits the person
 * looking (recruiterScore).
 */
export async function listCompanyPeople(db: D1Database, companyId: string, userId: string): Promise<CompanyPerson[]> {
  const [rows, seeker] = await Promise.all([
    db.prepare(
      `SELECT cc.id, cc.name, cc.title, cc.profile_url, ${TYPE_COLUMNS}, ot.id AS thread_id, ot.status AS thread_status,
         (SELECT om.sent_at FROM outreach_messages om WHERE om.thread_id = ot.id AND om.step = 0 AND om.status = 'sent') AS first_sent_at
       FROM company_contacts cc
       LEFT JOIN recruiter_candidates rc ON rc.id = cc.candidate_id
       LEFT JOIN outreach_threads ot ON ot.contact_id = cc.id AND ot.user_id = ?
       WHERE cc.company_id IN (${SAME_COMPANY})
         AND cc.status != 'removed'
         AND cc.source != 'pinkslip-test'
         AND (ot.id IS NOT NULL OR (cc.status = 'listed' AND cc.source != 'test'))`
    ).bind(userId, companyId).all<TypedRow & {
      id: string;
      name: string;
      profile_url: string | null;
      thread_id: string | null;
      thread_status: OutreachThreadStatus | null;
      first_sent_at: string | null;
    }>(),
    seekerFor(db, userId),
  ]);
  return (rows.results ?? [])
    .map((row) => ({ row, types: typesOf(row) }))
    // Someone the user already wrote to stays on their page.
    .filter(({ row, types }) => row.thread_id !== null || listable(types))
    .sort((a, b) => recruiterScore(a.types, seeker) - recruiterScore(b.types, seeker)
      || contactRank(a.row.title) - contactRank(b.row.title) || a.row.name.localeCompare(b.row.name))
    .map(({ row }): CompanyPerson => ({
      id: row.id,
      name: row.name,
      title: row.title,
      linkedin_url: row.profile_url,
      thread: row.thread_id ? { id: row.thread_id, status: row.thread_status!, first_sent_at: row.first_sent_at } : null,
    }));
}

/** How many recruiters a company lists: all a guest sees ("3 recruiters at
 * Stripe · Sign in to see them", owner 2026-10-24). */
export async function companyPeopleCount(db: D1Database, companyId: string): Promise<number> {
  const rows = (await db.prepare(
    `SELECT cc.title, ${TYPE_COLUMNS}
     FROM company_contacts cc
     LEFT JOIN recruiter_candidates rc ON rc.id = cc.candidate_id
     WHERE cc.company_id IN (${SAME_COMPANY}) AND cc.status = 'listed' AND cc.source NOT IN ('test', 'pinkslip-test')`
  ).bind(companyId).all<TypedRow>()).results ?? [];
  return rows.filter((row) => listable(typesOf(row))).length;
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
  actual_role: ActualRole | null;
  hires: string | null;
  hires_for: string | null;
  job: RecruiterJob | null;
  agency: number | null;
}

/**
 * Keeps a sourced recruiter's contact in step with the owner's labels
 * (owner, 2026-10-19 and 2026-10-24): "works there: yes", in recruiting and
 * not through an agency (their types), with a guessed address, lists them on
 * People. Anything else, or an address
 * a later search guessed differently, steps the old listing aside; it stays
 * for threads that point at it. A bounced or removed address never comes
 * back, and neither does one that asked to be left alone.
 */
export async function syncCandidateContact(db: D1Database, candidateId: string, now = new Date()): Promise<void> {
  const candidate = await db.prepare(
    `SELECT id, company_id, name, headline, current_title, profile_url, email_guess, works_there, actual_role,
            hires, hires_for, job, agency
     FROM recruiter_candidates WHERE id = ?`
  ).bind(candidateId).first<CandidateForContact>();
  if (!candidate) return;
  const email = candidate.email_guess ? normalizeEmail(candidate.email_guess) : null;
  const listed = candidate.works_there === "yes" && listable(recruiterTypes(candidate).types) && email !== null
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
