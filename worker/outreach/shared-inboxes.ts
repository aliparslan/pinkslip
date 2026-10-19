import { describeThrown } from "../errors";
import type { Env } from "../types";
import { emailHash } from "./contacts";
import type { CheckResult, EmailChecker } from "./email-check";
import { addressesAt } from "./sourcing/email-pattern";
import { lookupMx, websiteDomain } from "./sourcing/mail-domain";
import { serperSearch, type Search } from "./sourcing/source-company";

/* Shared early-career inboxes first (Decisions: Outreach #1): addresses a
 * public page shows, then the usual names, each through the email checker.
 * A team's inbox isn't one person's data, and only a passed check reaches
 * users (contacts.ts). Individual recruiters come later, from the sourcing
 * search, once its accuracy is proven (docs/recruiter-contacts-sourcing.md). */

/** The usual names, most common first. */
export const SHARED_INBOX_GUESSES = [
  "university", "universityrecruiting", "campus", "campusrecruiting",
  "earlycareers", "early-careers", "internships", "students",
];

const EARLY_CAREER_LOCAL = /universit|campus|early.?careers?|students?|interns?|new.?grads?|emerging/;

/** A title the ranking reads as early-career (contactRank). */
export function sharedInboxTitle(local: string): string {
  if (/universit/.test(local)) return "University recruiting";
  if (/campus/.test(local)) return "Campus recruiting";
  if (/early.?career/.test(local)) return "Early careers";
  if (/intern/.test(local)) return "Internships";
  if (/new.?grad/.test(local)) return "New grad recruiting";
  if (/emerging/.test(local)) return "Emerging talent";
  return "Student recruiting";
}

export interface FoundInbox {
  email: string;
  title: string;
  /** The search result that shows the address; null for a guess. */
  evidenceUrl: string | null;
  status: CheckResult;
}

export type FindingOutcome = "found" | "none" | "catch_all" | "no_mail";

export interface FindResult {
  mailDomain: string | null;
  outcome: FindingOutcome;
  /** Valid ones, and published ones the checker couldn't vouch for (kept
   * hidden, so an admin can see them). Failed guesses are dropped. */
  inboxes: FoundInbox[];
  checks: number;
}

/** Most checks one company gets, and how many passed inboxes are enough. */
const MAX_CHECKS = 10;
const ENOUGH = 2;

export function inboxSearchQuery(domain: string): string {
  return `"@${domain}" (university OR campus OR "early career" OR internship) recruiting`;
}

export async function findSharedInboxes(
  website: string,
  deps: {
    check: EmailChecker;
    search: Search | null;
    /** Where the company's mail goes, when the sourcing run already learned it. */
    knownDomain?: string | null;
    mx?: (domain: string) => Promise<string[]>;
  },
): Promise<FindResult> {
  const domain = deps.knownDomain || websiteDomain(website);
  if (!domain) return { mailDomain: null, outcome: "no_mail", inboxes: [], checks: 0 };
  const exchanges = await (deps.mx ?? lookupMx)(domain).catch(() => [] as string[]);
  if (exchanges.length === 0) return { mailDomain: domain, outcome: "no_mail", inboxes: [], checks: 0 };

  const published = new Map<string, string>();
  for (const result of deps.search ? await deps.search(inboxSearchQuery(domain), 1).catch(() => []) : []) {
    for (const local of addressesAt(`${result.title} ${result.snippet ?? ""}`, domain)) {
      if (EARLY_CAREER_LOCAL.test(local) && !published.has(local)) published.set(local, result.link);
    }
  }
  const candidates = [
    ...[...published].map(([local, link]) => ({ local, evidenceUrl: link as string | null })),
    ...SHARED_INBOX_GUESSES.filter((local) => !published.has(local)).map((local) => ({ local, evidenceUrl: null })),
  ];

  const inboxes: FoundInbox[] = [];
  let checks = 0;
  let failed = 0;
  let catchAll = false;
  for (const { local, evidenceUrl } of candidates) {
    if (inboxes.filter((inbox) => inbox.status === "valid").length >= ENOUGH) break;
    const email = `${local}@${domain}`;
    const title = sharedInboxTitle(local);
    if (catchAll) {
      // The domain takes any address: a guess there proves nothing, and a
      // published address can't be checked either.
      if (!evidenceUrl) break;
      inboxes.push({ email, title, evidenceUrl, status: "catch_all" });
      continue;
    }
    if (checks >= MAX_CHECKS) break;
    const status = await deps.check(email);
    checks += 1;
    if (!status) {
      failed += 1;
      continue;
    }
    if (status === "catch_all") catchAll = true;
    if (status === "valid" || (evidenceUrl && status !== "invalid")) inboxes.push({ email, title, evidenceUrl, status });
  }
  if (checks > 0 && failed === checks) throw new Error("The email checker didn't answer");
  const outcome: FindingOutcome = inboxes.some((inbox) => inbox.status === "valid") ? "found" : catchAll ? "catch_all" : "none";
  return { mailDomain: domain, outcome, inboxes, checks };
}

interface CompanyToSearch {
  id: string;
  name: string;
  website: string;
  mail_domain: string | null;
}

/** Each company is searched again after a quarter (people and inboxes change). */
const RESEARCH_DAYS = 90;

/** Companies due a search, the ones hiring most first. One that failed
 * (the checker didn't answer) is tried again the next day. */
async function companiesDue(db: D1Database, count: number, now: Date): Promise<CompanyToSearch[]> {
  const day = 24 * 60 * 60 * 1000;
  const stale = new Date(now.getTime() - RESEARCH_DAYS * day).toISOString();
  const retry = new Date(now.getTime() - day).toISOString();
  return (await db.prepare(
    `SELECT c.id, c.name, c.website, rs.mail_domain
     FROM companies c
     LEFT JOIN recruiter_sourcing rs ON rs.company_id = c.id
     LEFT JOIN contact_finding cf ON cf.company_id = c.id
     WHERE c.enabled = 1 AND c.website != ''
       AND (cf.ran_at IS NULL OR cf.ran_at < ? OR (cf.outcome = 'error' AND cf.ran_at < ?))
     ORDER BY cf.ran_at IS NOT NULL,
       (SELECT COUNT(*) FROM jobs j WHERE j.company_id = c.id AND j.closed_at IS NULL) DESC
     LIMIT ?`
  ).bind(stale, retry, count).all<CompanyToSearch>()).results ?? [];
}

export interface FindingRun {
  company: string;
  outcome: FindingOutcome | "error";
  found: string[];
  error: string | null;
}

/** Searches a few companies (or the one named) and saves what passed.
 * A suppressed address is never added; one already known keeps its status. */
export async function runContactFinding(
  env: Env,
  check: EmailChecker,
  { count = 2, companyId, now = new Date(), search, mx }: {
    count?: number;
    companyId?: string;
    now?: Date;
    search?: Search | null;
    mx?: (domain: string) => Promise<string[]>;
  } = {},
): Promise<FindingRun[]> {
  const companies = companyId
    ? (await env.DB.prepare(
      `SELECT c.id, c.name, c.website, rs.mail_domain FROM companies c
       LEFT JOIN recruiter_sourcing rs ON rs.company_id = c.id WHERE c.id = ?`
    ).bind(companyId).all<CompanyToSearch>()).results ?? []
    : await companiesDue(env.DB, count, now);
  const searcher = search !== undefined ? search : env.SERPER_API_KEY ? serperSearch(env.SERPER_API_KEY) : null;
  const runs: FindingRun[] = [];
  const stamp = now.toISOString();
  for (const company of companies) {
    try {
      const result = await findSharedInboxes(company.website, { check, search: searcher, knownDomain: company.mail_domain, mx });
      const kept: FoundInbox[] = [];
      for (const inbox of result.inboxes) {
        if (!await env.DB.prepare("SELECT 1 FROM contact_suppressions WHERE email_hash = ?").bind(await emailHash(inbox.email)).first()) kept.push(inbox);
      }
      await env.DB.batch([
        ...kept.map((inbox) => env.DB.prepare(
          `INSERT INTO company_contacts (id, company_id, email, name, title, source, kind, email_status, checked_at, evidence_url, created_at)
           VALUES (?, ?, ?, '', ?, ?, 'shared', ?, ?, ?, ?)
           ON CONFLICT(company_id, email) DO NOTHING`
        ).bind(crypto.randomUUID(), company.id, inbox.email, inbox.title, inbox.evidenceUrl ? "search" : "guess",
          inbox.status, stamp, inbox.evidenceUrl, stamp)),
        env.DB.prepare(
          `INSERT INTO contact_finding (company_id, mail_domain, outcome, found, checks, error, ran_at)
           VALUES (?, ?, ?, ?, ?, NULL, ?)
           ON CONFLICT(company_id) DO UPDATE SET mail_domain = excluded.mail_domain, outcome = excluded.outcome,
             found = excluded.found, checks = excluded.checks, error = NULL, ran_at = excluded.ran_at`
        ).bind(company.id, result.mailDomain, result.outcome, kept.filter((inbox) => inbox.status === "valid").length, result.checks, stamp),
      ]);
      runs.push({ company: company.name, outcome: result.outcome, found: kept.filter((inbox) => inbox.status === "valid").map((inbox) => inbox.email), error: null });
    } catch (error) {
      const message = describeThrown(error).message.slice(0, 300);
      await env.DB.prepare(
        `INSERT INTO contact_finding (company_id, mail_domain, outcome, found, checks, error, ran_at)
         VALUES (?, NULL, 'error', 0, 0, ?, ?)
         ON CONFLICT(company_id) DO UPDATE SET outcome = 'error', error = excluded.error, ran_at = excluded.ran_at`
      ).bind(company.id, message, stamp).run();
      runs.push({ company: company.name, outcome: "error", found: [], error: message });
    }
  }
  return runs;
}
