import {
  kindMatchesRole,
  type ActualRole,
  type RecruiterCandidate,
  type RecruiterCompany,
  type RecruiterCompanyChoice,
  type RecruiterReview,
  type RecruiterReviewScore,
  type WorksThere,
} from "../../../shared/recruiter-review";
import { syncCompanyCandidates } from "../contacts";
import { applyTemplate, cleanPersonName, completeNameFromSlug } from "./email-pattern";
import { websiteDomain } from "./mail-domain";
import { emailConfidence, type SourcedCompany } from "./source-company";

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
         (company_id, site, mail_domain, mail_domain_source, mail_provider, pattern, pattern_votes, pattern_sources, searches, error, ran_at,
          pattern_source, linkedin_slug, linkedin_name, name_shared, github_org, github_pattern, github_votes, github_total)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(company_id) DO UPDATE SET
         site = excluded.site, mail_domain = excluded.mail_domain, mail_domain_source = excluded.mail_domain_source,
         mail_provider = excluded.mail_provider, pattern = excluded.pattern, pattern_votes = excluded.pattern_votes,
         pattern_sources = excluded.pattern_sources, searches = recruiter_sourcing.searches + excluded.searches,
         error = NULL, ran_at = excluded.ran_at, pattern_source = excluded.pattern_source,
         linkedin_slug = excluded.linkedin_slug, linkedin_name = excluded.linkedin_name, name_shared = excluded.name_shared,
         github_org = excluded.github_org, github_pattern = excluded.github_pattern,
         github_votes = excluded.github_votes, github_total = excluded.github_total`
    ).bind(
      company.id, company.site, result.mail.domain, result.mail.source, result.provider,
      result.pattern?.template ?? null, result.pattern?.votes ?? 0, result.pattern?.total ?? 0, result.searches, now,
      result.pattern?.source ?? null, result.linkedin?.slug ?? null, result.linkedin?.name ?? null, result.nameShared ? 1 : 0,
      result.github?.org ?? null, result.github?.template ?? null, result.github?.votes ?? 0, result.github?.total ?? 0,
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
      `SELECT rs.company_id, c.name AS company, rs.site, rs.mail_domain, rs.mail_domain_source, rs.pattern,
              rs.pattern_votes, rs.pattern_sources, rs.pattern_source, rs.linkedin_slug, rs.linkedin_name, rs.name_shared,
              rs.github_org, rs.github_pattern, rs.github_votes, rs.github_total, rs.error, rs.ran_at
       FROM recruiter_sourcing rs JOIN companies c ON c.id = rs.company_id
       ORDER BY rs.ran_at DESC`
    ).all<Omit<RecruiterCompany, "name_shared"> & { name_shared: number }>(),
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
  return {
    companies: (companies.results ?? []).map((row) => ({ ...row, name_shared: row.name_shared === 1 })),
    candidates: rows,
    score: scoreReview(rows),
  };
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

/** The companies you picked to search (Paper R3), in the order given. */
export async function companiesByIds(db: D1Database, ids: string[]): Promise<CompanyToSource[]> {
  if (ids.length === 0) return [];
  const rows = (await db.prepare(
    `SELECT id, name, website FROM companies WHERE website != '' AND id IN (${ids.map(() => "?").join(", ")})`
  ).bind(...ids).all<{ id: string; name: string; website: string }>()).results ?? [];
  const byId = new Map(rows.map((row) => [row.id, row]));
  return ids.flatMap((id) => {
    const row = byId.get(id);
    const site = row ? websiteDomain(row.website) : null;
    return row && site ? [{ id: row.id, name: row.name, site }] : [];
  });
}

export type CompanyFilter = "hiring" | "not_searched" | "has_format";

/** Catalog companies for "Choose companies": most open jobs first, with when
 * each was searched and its format (yours first). */
export async function companyChoices(
  db: D1Database,
  { q = "", filter, limit = 50 }: { q?: string; filter?: CompanyFilter; limit?: number } = {},
): Promise<RecruiterCompanyChoice[]> {
  const where = ["c.enabled = 1", "c.website != ''"];
  const binds: unknown[] = [];
  if (q.trim()) {
    where.push("(lower(c.name) LIKE ? OR lower(c.website) LIKE ?)");
    binds.push(`%${q.trim().toLowerCase()}%`, `%${q.trim().toLowerCase()}%`);
  }
  if (filter === "not_searched") where.push("rs.company_id IS NULL");
  if (filter === "has_format") where.push("(f.pattern IS NOT NULL OR rs.pattern IS NOT NULL)");
  const rows = (await db.prepare(
    `SELECT c.id, c.name, c.website, rs.ran_at AS searched_at,
       (SELECT COUNT(*) FROM jobs j WHERE j.company_id = c.id AND j.closed_at IS NULL) AS open_jobs,
       (SELECT COUNT(*) FROM recruiter_candidates rc WHERE rc.company_id = c.id AND rc.left_out_reason IS NULL) AS kept,
       COALESCE(f.pattern, rs.pattern) AS pattern,
       CASE WHEN f.pattern IS NOT NULL THEN 'owner' ELSE rs.pattern_source END AS pattern_source
     FROM companies c
     LEFT JOIN recruiter_sourcing rs ON rs.company_id = c.id
     LEFT JOIN company_mail_formats f ON f.company_id = c.id
     WHERE ${where.join(" AND ")}
     ${filter === "hiring" ? "AND (SELECT COUNT(*) FROM jobs j WHERE j.company_id = c.id AND j.closed_at IS NULL) > 0" : ""}
     ORDER BY open_jobs DESC, c.name
     LIMIT ?`
  ).bind(...binds, limit).all<Omit<RecruiterCompanyChoice, "site"> & { website: string }>()).results ?? [];
  return rows.map(({ website, ...row }) => ({ ...row, site: websiteDomain(website) ?? website }));
}

/** Where a company's open jobs are, to tell its recruiters from a namesake's. */
export async function companyOffices(db: D1Database, companyId: string): Promise<string[]> {
  const rows = (await db.prepare(
    "SELECT DISTINCT location FROM jobs WHERE company_id = ? AND closed_at IS NULL AND location != '' LIMIT 50"
  ).bind(companyId).all<{ location: string }>()).results ?? [];
  return rows.map((row) => row.location);
}

export async function ownerFormat(db: D1Database, companyId: string): Promise<{ domain: string; pattern: string } | null> {
  return db.prepare("SELECT domain, pattern FROM company_mail_formats WHERE company_id = ?")
    .bind(companyId).first<{ domain: string; pattern: string }>();
}

/**
 * Your format for a company (Paper R4): kept for its next searches, and every
 * address already guessed there is written again from it. Recruiters on
 * People follow (syncCompanyCandidates). Returns how many were rewritten.
 */
export async function setOwnerFormat(db: D1Database, companyId: string, domain: string, pattern: string, now = new Date()): Promise<number> {
  const stamp = now.toISOString();
  await db.prepare(
    `INSERT INTO company_mail_formats (company_id, domain, pattern, set_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(company_id) DO UPDATE SET domain = excluded.domain, pattern = excluded.pattern, set_at = excluded.set_at`
  ).bind(companyId, domain, pattern, stamp).run();
  await db.prepare(
    `UPDATE recruiter_sourcing SET mail_domain = ?, mail_domain_source = CASE WHEN site = ? THEN 'website' ELSE 'format pages' END,
       pattern = ?, pattern_votes = 1, pattern_sources = 1, pattern_source = 'owner'
     WHERE company_id = ?`
  ).bind(domain, domain, pattern, companyId).run();
  const candidates = (await db.prepare(
    "SELECT id, name, profile_url, left_out_reason FROM recruiter_candidates WHERE company_id = ?"
  ).bind(companyId).all<{ id: string; name: string; profile_url: string; left_out_reason: string | null }>()).results ?? [];
  const source = { template: pattern, votes: 1, total: 1, source: "owner" as const };
  const writes = candidates.map((row) => {
    const slug = decodeURIComponent(row.profile_url.split("/in/")[1]?.split(/[/?#]/)[0] ?? "").toLowerCase();
    const cleaned = cleanPersonName(row.name);
    const name = cleaned ? completeNameFromSlug(cleaned, slug) : null;
    const local = name ? applyTemplate(pattern, name) : null;
    return db.prepare("UPDATE recruiter_candidates SET email_guess = ?, email_confidence = ? WHERE id = ?").bind(
      local ? `${local}@${domain}` : null,
      row.left_out_reason === null ? emailConfidence({ name }, source, local) : null,
      row.id,
    );
  });
  for (let start = 0; start < writes.length; start += 50) await db.batch(writes.slice(start, start + 50));
  await syncCompanyCandidates(db, companyId, now);
  return candidates.length;
}
