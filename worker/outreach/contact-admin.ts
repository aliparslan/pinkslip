import { normalizeEmail } from "../account";
import { emailHash } from "./contacts";
import { websiteDomain } from "./sourcing/mail-domain";
import { stopThreadsTo } from "./threads";

/* Admin's side of the contact list: imports, taking someone off People, and
 * a recruiter's removal request (Decisions: Outreach #3). Sourced recruiters
 * are listed from Admin → Recruiters' labels instead (contacts.ts). */

export interface RemovalResult {
  contacts: number;
  threads_stopped: number;
}

/**
 * A recruiter asked to be left alone: suppressed for everyone, for good.
 * Their details are wiped from every company's list (threads that already
 * went out keep their own text, with the contact blank), open follow-ups
 * stop, and the sourcing review forgets them.
 */
export async function removeContactEmail(db: D1Database, rawEmail: string, now = new Date()): Promise<RemovalResult> {
  const email = normalizeEmail(rawEmail);
  await db.prepare("INSERT INTO contact_suppressions (email_hash, created_at) VALUES (?, ?) ON CONFLICT(email_hash) DO NOTHING")
    .bind(await emailHash(email), now.toISOString()).run();
  const contacts = (await db.prepare("SELECT id FROM company_contacts WHERE lower(email) = ?").bind(email).all<{ id: string }>()).results ?? [];
  let stopped = 0;
  for (const { id } of contacts) {
    stopped += await stopThreadsTo(db, id, now);
    await db.prepare(
      `UPDATE company_contacts
       SET email = 'removed:' || id, name = '', title = '', profile_url = NULL, candidate_id = NULL, status = 'removed'
       WHERE id = ?`
    ).bind(id).run();
  }
  await db.prepare("DELETE FROM recruiter_candidates WHERE lower(email_guess) = ?").bind(email).run();
  return { contacts: contacts.length, threads_stopped: stopped };
}

/** Takes an imported contact off People. One nobody wrote to is deleted;
 * one somebody did stays, hidden, for their thread. (A sourced recruiter
 * leaves by changing their label in Admin → Recruiters.) */
export async function unlistContact(db: D1Database, contactId: string): Promise<boolean> {
  const contact = await db.prepare("SELECT status FROM company_contacts WHERE id = ?").bind(contactId).first<{ status: string }>();
  if (!contact) return false;
  if (contact.status !== "listed") return true;
  const used = await db.prepare("SELECT 1 FROM outreach_threads WHERE contact_id = ? LIMIT 1").bind(contactId).first();
  await (used
    ? db.prepare("UPDATE company_contacts SET status = 'hidden' WHERE id = ?")
    : db.prepare("DELETE FROM company_contacts WHERE id = ?")
  ).bind(contactId).run();
  return true;
}

export interface ContactImportRow {
  /** The company's id, website or domain; empty to match by the address's domain. */
  company: string;
  email: string;
  name?: string;
  title?: string;
  source?: string;
}

export interface ImportReport {
  added: number;
  updated: number;
  skipped: Array<{ row: number; email: string; reason: "bad email" | "no company" | "suppressed" | "bounced" | "removed" }>;
}

export const MAX_IMPORT_ROWS = 5000;

/** Reads a CSV with a header row: company (or website, domain), email,
 * name, title, source. Quoted fields may hold commas and newlines. */
export function parseContactCsv(text: string): ContactImportRow[] {
  const records: string[][] = [];
  let field = "";
  let record: string[] = [];
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]!;
    if (quoted) {
      if (char === "\"" && text[index + 1] === "\"") {
        field += "\"";
        index += 1;
      } else if (char === "\"") {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === "\"") {
      quoted = true;
    } else if (char === ",") {
      record.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      record.push(field);
      records.push(record);
      record = [];
      field = "";
    } else {
      field += char;
    }
  }
  if (field || record.length) records.push([...record, field]);
  const [header, ...rows] = records.filter((row) => row.some((cell) => cell.trim()));
  if (!header) return [];
  const column = (...names: string[]) => header.findIndex((cell) => names.includes(cell.trim().toLowerCase()));
  const at = {
    company: column("company", "company_id", "website", "domain"),
    email: column("email", "address"),
    name: column("name"),
    title: column("title"),
    source: column("source"),
  };
  const cell = (row: string[], index: number) => (index >= 0 ? row[index] ?? "" : "").trim();
  return rows.map((row) => ({
    company: cell(row, at.company),
    email: cell(row, at.email),
    name: cell(row, at.name),
    title: cell(row, at.title),
    source: cell(row, at.source),
  }));
}

const EMAIL = /^[^\s@,;<>"]+@[a-z0-9-]+(\.[a-z0-9-]+)+$/;

/**
 * Adds a sourced list (docs/recruiter-contacts-sourcing.md, "What Pinkslip
 * builds" #2). Each row is matched to companies by id, by website or mail
 * domain, or by the address's own domain; a company listed twice gets it
 * twice. An import is the owner's own list, so it's listed on People at
 * once. A dry run reports without writing.
 */
export async function importContacts(
  db: D1Database,
  rows: ContactImportRow[],
  { dryRun = false, now = new Date() }: { dryRun?: boolean; now?: Date } = {},
): Promise<ImportReport> {
  const companies = (await db.prepare(
    `SELECT c.id, c.website, rs.mail_domain FROM companies c
     LEFT JOIN recruiter_sourcing rs ON rs.company_id = c.id`
  ).all<{ id: string; website: string; mail_domain: string | null }>()).results ?? [];
  const ids = new Set(companies.map((company) => company.id));
  const byDomain = new Map<string, Set<string>>();
  for (const company of companies) {
    for (const domain of [websiteDomain(company.website), company.mail_domain?.toLowerCase()]) {
      if (domain) byDomain.set(domain, (byDomain.get(domain) ?? new Set()).add(company.id));
    }
  }
  const matchCompanies = (company: string, email: string): string[] => {
    if (ids.has(company)) return [company];
    const domain = company ? websiteDomain(company) : null;
    const found = (domain && byDomain.get(domain)) || byDomain.get(email.slice(email.indexOf("@") + 1));
    return found ? [...found] : [];
  };

  const report: ImportReport = { added: 0, updated: 0, skipped: [] };
  const writes: D1PreparedStatement[] = [];
  const queued = new Set<string>();
  const stamp = now.toISOString();
  for (const [index, row] of rows.slice(0, MAX_IMPORT_ROWS).entries()) {
    const email = normalizeEmail(row.email);
    const line = index + 1;
    if (!EMAIL.test(email)) {
      report.skipped.push({ row: line, email, reason: "bad email" });
      continue;
    }
    const companyIds = matchCompanies(row.company.trim(), email);
    if (companyIds.length === 0) {
      report.skipped.push({ row: line, email, reason: "no company" });
      continue;
    }
    if (await db.prepare("SELECT 1 FROM contact_suppressions WHERE email_hash = ?").bind(await emailHash(email)).first()) {
      report.skipped.push({ row: line, email, reason: "suppressed" });
      continue;
    }
    for (const companyId of companyIds) {
      const existing = await db.prepare("SELECT status FROM company_contacts WHERE company_id = ? AND email = ?")
        .bind(companyId, email).first<{ status: string }>();
      if (existing?.status === "bounced" || existing?.status === "removed") {
        report.skipped.push({ row: line, email, reason: existing.status });
        continue;
      }
      if (existing || queued.has(`${companyId} ${email}`)) report.updated += 1;
      else report.added += 1;
      queued.add(`${companyId} ${email}`);
      writes.push(db.prepare(
        `INSERT INTO company_contacts (id, company_id, email, name, title, source, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 'listed', ?)
         ON CONFLICT(company_id, email) DO UPDATE SET
           name = CASE WHEN excluded.name != '' THEN excluded.name ELSE company_contacts.name END,
           title = CASE WHEN excluded.title != '' THEN excluded.title ELSE company_contacts.title END,
           source = excluded.source, status = 'listed'`
      ).bind(crypto.randomUUID(), companyId, email, row.name?.trim() ?? "", row.title?.trim() ?? "",
        row.source?.trim() || "import", stamp));
    }
  }
  if (!dryRun) {
    for (let start = 0; start < writes.length; start += 100) await db.batch(writes.slice(start, start + 100));
  }
  return report;
}
