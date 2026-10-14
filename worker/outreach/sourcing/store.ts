import {
  kindMatchesRole,
  type ActualRole,
  type RecruiterCandidate,
  type RecruiterCompany,
  type RecruiterReview,
  type RecruiterReviewScore,
  type WorksThere,
} from "../../../shared/recruiter-review";
import { websiteDomain } from "./mail-domain";
import type { SourcedCompany } from "./source-company";

/* Saving sourcing runs for admin review, and the owner's labels. See
 * migrations/0092_recruiter_sourcing.sql. */

export interface CompanyToSource {
  id: string;
  name: string;
  site: string;
}

/** Enabled catalog companies with a website that haven't been sourced, in
 * random order so the sample stays representative. A company listed twice
 * (two job sources, one website) is sourced once. */
export async function companiesToSource(db: D1Database, count: number): Promise<CompanyToSource[]> {
  const [candidates, sourced] = await Promise.all([
    db.prepare(
      `SELECT id, name, website FROM companies
       WHERE enabled = 1 AND website != ''
         AND id NOT IN (SELECT company_id FROM recruiter_sourcing)
       ORDER BY RANDOM() LIMIT ?`
    ).bind(count * 4).all<{ id: string; name: string; website: string }>(),
    db.prepare("SELECT site FROM recruiter_sourcing").all<{ site: string }>(),
  ]);
  const seen = new Set((sourced.results ?? []).map((row) => row.site));
  const picked: CompanyToSource[] = [];
  for (const row of candidates.results ?? []) {
    const site = websiteDomain(row.website);
    if (!site || seen.has(site)) continue;
    seen.add(site);
    picked.push({ id: row.id, name: row.name, site });
    if (picked.length === count) break;
  }
  return picked;
}

export async function saveSourcing(db: D1Database, company: CompanyToSource, result: SourcedCompany, now: string): Promise<void> {
  const statements = [
    db.prepare(
      `INSERT INTO recruiter_sourcing
         (company_id, site, mail_domain, mail_domain_source, mail_provider, pattern, pattern_votes, pattern_sources, searches, error, ran_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)
       ON CONFLICT(company_id) DO UPDATE SET
         site = excluded.site, mail_domain = excluded.mail_domain, mail_domain_source = excluded.mail_domain_source,
         mail_provider = excluded.mail_provider, pattern = excluded.pattern, pattern_votes = excluded.pattern_votes,
         pattern_sources = excluded.pattern_sources, searches = recruiter_sourcing.searches + excluded.searches,
         error = NULL, ran_at = excluded.ran_at`
    ).bind(
      company.id, company.site, result.mail.domain, result.mail.source, result.provider,
      result.pattern?.template ?? null, result.pattern?.votes ?? 0, result.pattern?.total ?? 0, result.searches, now,
    ),
    // Labels stay; everything the search says is refreshed.
    ...result.people.map((row) => db.prepare(
      `INSERT INTO recruiter_candidates
         (id, company_id, profile_url, name, headline, current_title, current_employer, location, kind, kind_from_snippet,
          employer_evidence, left_out_reason, email_guess, email_confidence, found_at, seen_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(company_id, profile_url) DO UPDATE SET
         name = excluded.name, headline = excluded.headline, current_title = excluded.current_title,
         current_employer = excluded.current_employer, location = excluded.location, kind = excluded.kind,
         kind_from_snippet = excluded.kind_from_snippet, employer_evidence = excluded.employer_evidence,
         left_out_reason = excluded.left_out_reason, email_guess = excluded.email_guess,
         email_confidence = excluded.email_confidence, seen_at = excluded.seen_at`
    ).bind(
      crypto.randomUUID(), company.id, row.person.profileUrl, row.person.name?.display ?? row.person.rawName,
      row.person.headline, row.person.role, row.person.employer, row.person.location, row.kind, row.weak ? 1 : 0,
      row.employerEvidence, row.reason, row.emailGuess, row.emailConfidence, now, now,
    )),
  ];
  await db.batch(statements);
}

export async function saveSourcingError(db: D1Database, company: CompanyToSource, error: string, now: string): Promise<void> {
  await db.prepare(
    `INSERT INTO recruiter_sourcing (company_id, site, mail_domain, mail_domain_source, error, ran_at)
     VALUES (?, ?, ?, 'website', ?, ?)
     ON CONFLICT(company_id) DO UPDATE SET error = excluded.error, ran_at = excluded.ran_at`
  ).bind(company.id, company.site, company.site, error.slice(0, 500), now).run();
}

interface CandidateRow extends Omit<RecruiterCandidate, "kind_from_snippet"> {
  kind_from_snippet: number;
}

const MAX_CANDIDATES = 1000;

export async function recruiterReview(db: D1Database): Promise<Omit<RecruiterReview, "available" | "can_run">> {
  const [companies, candidates] = await Promise.all([
    db.prepare(
      `SELECT rs.company_id, c.name AS company, rs.mail_domain, rs.mail_domain_source, rs.pattern,
              rs.pattern_votes, rs.pattern_sources, rs.error, rs.ran_at
       FROM recruiter_sourcing rs JOIN companies c ON c.id = rs.company_id
       ORDER BY rs.ran_at DESC`
    ).all<RecruiterCompany>(),
    db.prepare(
      `SELECT rc.id, rc.company_id, c.name AS company, rc.profile_url, rc.name, rc.headline, rc.current_title,
              rc.current_employer, rc.location, rc.kind, rc.kind_from_snippet, rc.employer_evidence,
              rc.left_out_reason, rc.email_guess, rc.email_confidence, rc.works_there, rc.actual_role, rc.reviewed_at
       FROM recruiter_candidates rc JOIN companies c ON c.id = rc.company_id
       JOIN recruiter_sourcing rs ON rs.company_id = rc.company_id
       ORDER BY rs.ran_at DESC, rc.left_out_reason IS NOT NULL, rc.found_at, rc.rowid
       LIMIT ?`
    ).bind(MAX_CANDIDATES).all<CandidateRow>(),
  ]);
  const rows = (candidates.results ?? []).map((row) => ({ ...row, kind_from_snippet: row.kind_from_snippet === 1 }));
  return { companies: companies.results ?? [], candidates: rows, score: scoreReview(rows) };
}

export function scoreReview(rows: RecruiterCandidate[]): RecruiterReviewScore {
  const kept = rows.filter((row) => row.left_out_reason === null);
  const leftOut = rows.filter((row) => row.left_out_reason !== null);
  const withWorks = kept.filter((row) => row.works_there === "yes" || row.works_there === "no");
  const withRole = kept.filter((row) => row.actual_role !== null);
  const early = withRole.filter((row) => row.kind === "early_career");
  const leftOutLabelled = leftOut.filter((row) => row.works_there !== null && row.actual_role !== null);
  return {
    works_there: { yes: withWorks.filter((row) => row.works_there === "yes").length, labelled: withWorks.length },
    role: { right: withRole.filter((row) => kindMatchesRole(row.kind, row.actual_role!)).length, labelled: withRole.length },
    early_career: { right: early.filter((row) => row.actual_role === "early_career").length, labelled: early.length },
    wrongly_left_out: leftOutLabelled.filter((row) => row.works_there === "yes" && row.actual_role !== "not_recruiter").length,
    left_out_labelled: leftOutLabelled.length,
  };
}

export interface CandidateLabels {
  works_there?: WorksThere | null;
  actual_role?: ActualRole | null;
}

/** Sets either label, or clears it with null. A person counts as reviewed
 * once both are answered. Null when there's no such person. */
export async function labelCandidate(db: D1Database, id: string, labels: CandidateLabels, now: string): Promise<RecruiterCandidate | null> {
  const current = await db.prepare("SELECT works_there, actual_role FROM recruiter_candidates WHERE id = ?")
    .bind(id).first<{ works_there: WorksThere | null; actual_role: ActualRole | null }>();
  if (!current) return null;
  const worksThere = labels.works_there === undefined ? current.works_there : labels.works_there;
  const actualRole = labels.actual_role === undefined ? current.actual_role : labels.actual_role;
  await db.prepare(
    "UPDATE recruiter_candidates SET works_there = ?, actual_role = ?, reviewed_at = ? WHERE id = ?"
  ).bind(worksThere, actualRole, worksThere && actualRole ? now : null, id).run();
  const row = await db.prepare(
    `SELECT rc.id, rc.company_id, c.name AS company, rc.profile_url, rc.name, rc.headline, rc.current_title,
            rc.current_employer, rc.location, rc.kind, rc.kind_from_snippet, rc.employer_evidence,
            rc.left_out_reason, rc.email_guess, rc.email_confidence, rc.works_there, rc.actual_role, rc.reviewed_at
     FROM recruiter_candidates rc JOIN companies c ON c.id = rc.company_id WHERE rc.id = ?`
  ).bind(id).first<CandidateRow>();
  return row ? { ...row, kind_from_snippet: row.kind_from_snippet === 1 } : null;
}
