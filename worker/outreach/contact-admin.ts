import { normalizeEmail } from "../account";
import { emailHash, type ContactKind } from "./contacts";
import { isRoleAddress } from "./sourcing/email-pattern";
import { websiteDomain } from "./sourcing/mail-domain";
import { stopThreadsTo } from "./threads";

/* Admin's side of the contact list: imports, a recruiter's removal request,
 * and turning down a contact that isn't useful (Decisions: Outreach #2, #3). */

async function suppress(db: D1Database, email: string, reason: "asked" | "rejected", now: Date): Promise<void> {
  // A removal request outranks an admin's "not useful".
  await db.prepare(
    `INSERT INTO contact_suppressions (email_hash, reason, created_at) VALUES (?, ?, ?)
     ON CONFLICT(email_hash) DO UPDATE SET reason = 'asked' WHERE excluded.reason = 'asked'`
  ).bind(await emailHash(email), reason, now.toISOString()).run();
}

export interface RemovalResult {
  contacts: number;
  threads_stopped: number;
}

/**
 * A recruiter asked to be left alone: suppressed for everyone, for good.
 * Their details are wiped from every company's list (threads that already
 * went out keep their own text, with the contact blank), open follow-ups
 * stop, and the sourcing review forgets the address.
 */
export async function removeContactEmail(db: D1Database, rawEmail: string, now = new Date()): Promise<RemovalResult> {
  const email = normalizeEmail(rawEmail);
  await suppress(db, email, "asked", now);
  const contacts = (await db.prepare("SELECT id FROM company_contacts WHERE lower(email) = ?").bind(email).all<{ id: string }>()).results ?? [];
  let stopped = 0;
  for (const { id } of contacts) {
    stopped += await stopThreadsTo(db, id, now);
    await db.prepare(
      `UPDATE company_contacts
       SET email = 'removed:' || id, name = '', title = '', evidence_url = NULL, email_status = 'removed', checked_at = ?
       WHERE id = ?`
    ).bind(now.toISOString(), id).run();
  }
  await db.prepare("UPDATE recruiter_candidates SET email_guess = NULL WHERE lower(email_guess) = ?").bind(email).run();
  return { contacts: contacts.length, threads_stopped: stopped };
}

/** An admin's "not useful": never added again. Kept, hidden, only while
 * users' threads point at it. */
export async function rejectContact(db: D1Database, contactId: string, now = new Date()): Promise<boolean> {
  const contact = await db.prepare("SELECT email, email_status FROM company_contacts WHERE id = ?")
    .bind(contactId).first<{ email: string; email_status: string }>();
  if (!contact) return false;
  if (contact.email_status === "removed") return true;
  await suppress(db, contact.email, "rejected", now);
  const used = await db.prepare("SELECT 1 FROM outreach_threads WHERE contact_id = ? LIMIT 1").bind(contactId).first();
  await (used
    ? db.prepare("UPDATE company_contacts SET email_status = 'rejected' WHERE id = ?")
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
  kind?: string;
  source?: string;
}

export interface ImportReport {
  added: number;
  updated: number;
  skipped: Array<{ row: number; email: string; reason: "bad email" | "no company" | "suppressed" | "bounced" | "removed" }>;
}

export const MAX_IMPORT_ROWS = 5000;

/** Reads a CSV with a header row: company (or website, domain), email,
 * name, title, kind, source. Quoted fields may hold commas and newlines. */
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
    kind: column("kind"),
    source: column("source"),
  };
  const cell = (row: string[], index: number) => (index >= 0 ? row[index] ?? "" : "").trim();
  return rows.map((row) => ({
    company: cell(row, at.company),
    email: cell(row, at.email),
    name: cell(row, at.name),
    title: cell(row, at.title),
    kind: cell(row, at.kind),
    source: cell(row, at.source),
  }));
}

const EMAIL = /^[^\s@,;<>"]+@[a-z0-9-]+(\.[a-z0-9-]+)+$/;

/**
 * Adds a sourced list (docs/recruiter-contacts-sourcing.md, "What Pinkslip
 * builds" #2). Each row is matched to companies by id, by website or mail
 * domain, or by the address's own domain; a company listed twice gets it
 * twice. New addresses start unchecked, so users see them only once the
 * checker passes them. A dry run reports without writing.
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
    const kind: ContactKind = row.kind === "shared" || row.kind === "person"
      ? row.kind
      : isRoleAddress(email.slice(0, email.indexOf("@"))) ? "shared" : "person";
    for (const companyId of companyIds) {
      const existing = await db.prepare("SELECT email_status FROM company_contacts WHERE company_id = ? AND email = ?")
        .bind(companyId, email).first<{ email_status: string }>();
      if (existing?.email_status === "bounced" || existing?.email_status === "removed") {
        report.skipped.push({ row: line, email, reason: existing.email_status });
        continue;
      }
      if (existing || queued.has(`${companyId} ${email}`)) report.updated += 1;
      else report.added += 1;
      queued.add(`${companyId} ${email}`);
      writes.push(db.prepare(
        `INSERT INTO company_contacts (id, company_id, email, name, title, source, kind, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(company_id, email) DO UPDATE SET
           name = CASE WHEN excluded.name != '' THEN excluded.name ELSE company_contacts.name END,
           title = CASE WHEN excluded.title != '' THEN excluded.title ELSE company_contacts.title END,
           kind = excluded.kind, source = excluded.source`
      ).bind(crypto.randomUUID(), companyId, email, row.name?.trim() ?? "", row.title?.trim() ?? "",
        row.source?.trim() || "import", kind, stamp));
    }
  }
  if (!dryRun) {
    for (let start = 0; start < writes.length; start += 100) await db.batch(writes.slice(start, start + 100));
  }
  return report;
}
