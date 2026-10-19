import { recordError } from "../errors";
import type { Env } from "../types";
import { stopThreadsTo } from "./threads";

/* Address checks through an email-verification service (Decisions: Outreach,
 * the 2026-10-16 addition). A homemade check doesn't work: Workers can't
 * open port 25, and repeated probing gets an address blocklisted. Users only
 * ever see addresses the last check passed (contacts.ts). */

export type CheckResult = "valid" | "catch_all" | "unknown" | "invalid";
/** null when the service itself failed: nothing was learned, ask again later. */
export type EmailChecker = (email: string) => Promise<CheckResult | null>;

interface MillionVerifierResponse {
  result?: string;
}

/** MillionVerifier's one-address API (docs/recruiter-contacts-sourcing.md:
 * about $37 for 10,000 checks). */
export function millionVerifier(apiKey: string, fetcher: typeof fetch = fetch): EmailChecker {
  return async (email) => {
    const url = `https://api.millionverifier.com/api/v3/?api=${encodeURIComponent(apiKey)}&email=${encodeURIComponent(email)}&timeout=10`;
    const response = await fetcher(url).catch(() => null);
    if (!response?.ok) return null;
    const body = await response.json().catch(() => null) as MillionVerifierResponse | null;
    switch (body?.result) {
      case "ok": return "valid";
      case "catch_all": return "catch_all";
      case "unknown": return "unknown";
      case "invalid":
      case "disposable": return "invalid";
      // "error", an empty answer, or the key out of credits.
      default: return null;
    }
  };
}

/** The checker, once EMAIL_CHECK_API_KEY is set; nothing is checked before. */
export function emailCheckerFor(env: Env, fetcher?: typeof fetch): EmailChecker | null {
  const key = env.EMAIL_CHECK_API_KEY?.trim();
  return key ? millionVerifier(key, fetcher) : null;
}

const DAY_MS = 24 * 60 * 60 * 1000;
/** Every address is checked again after a week. */
export const RECHECK_DAYS = 7;
/** A check that didn't finish is tried again the next day. */
const RETRY_DAYS = 1;
/** Rides the 15-minute notifications cycle: about 2,400 checks a day at most,
 * so a 2,000-address list gets its weekly check with room for imports. */
export const CHECKS_PER_RUN = 25;
const AT_ONCE = 5;

export type CheckCounts = Record<CheckResult | "failed", number>;

interface DueContact {
  id: string;
  email: string;
  email_status: string;
}

/** What one check means for a contact. invalid stops follow-ups to it: they
 * would only bounce. */
export async function applyCheck(db: D1Database, contact: DueContact, result: CheckResult, now = new Date()): Promise<void> {
  const stamp = now.toISOString();
  if (result === "unknown") {
    // A passed address keeps showing while the service can't say; either way
    // it's asked again tomorrow instead of next week.
    const retry = new Date(now.getTime() - (RECHECK_DAYS - RETRY_DAYS) * DAY_MS).toISOString();
    await db.prepare(
      `UPDATE company_contacts SET email_status = CASE WHEN email_status = 'valid' THEN 'valid' ELSE 'unknown' END, checked_at = ?
       WHERE id = ?`
    ).bind(retry, contact.id).run();
    return;
  }
  await db.prepare("UPDATE company_contacts SET email_status = ?, checked_at = ? WHERE id = ?")
    .bind(result, stamp, contact.id).run();
  if (result === "invalid") await stopThreadsTo(db, contact.id, now);
}

/** Checks the addresses that are due: new ones first, then any last checked
 * over a week ago. Final statuses (bounced, invalid, removed, rejected) and
 * stand-in test contacts are never checked. */
export async function checkDueContacts(
  env: Env,
  checker: EmailChecker,
  { limit = CHECKS_PER_RUN, now = new Date() }: { limit?: number; now?: Date } = {},
): Promise<CheckCounts> {
  const due = new Date(now.getTime() - RECHECK_DAYS * DAY_MS).toISOString();
  const rows = (await env.DB.prepare(
    `SELECT id, email, email_status FROM company_contacts
     WHERE email_status IN ('unchecked', 'valid', 'catch_all', 'unknown')
       AND source NOT IN ('test', 'pinkslip-test')
       AND (checked_at IS NULL OR checked_at <= ?)
     ORDER BY checked_at IS NOT NULL, checked_at
     LIMIT ?`
  ).bind(due, limit).all<DueContact>()).results ?? [];
  const counts: CheckCounts = { valid: 0, catch_all: 0, unknown: 0, invalid: 0, failed: 0 };
  for (let start = 0; start < rows.length; start += AT_ONCE) {
    await Promise.all(rows.slice(start, start + AT_ONCE).map(async (row) => {
      const result = await checker(row.email);
      counts[result ?? "failed"] += 1;
      if (result) await applyCheck(env.DB, row, result, now);
    }));
  }
  // Every check failing is the service (a spent balance, a changed key), not
  // the addresses: a new kind of error reaches admins within a minute.
  if (rows.length > 0 && counts.failed === rows.length) {
    await recordError(env.DB, { source: "cron", route: "contact checks", name: "EmailCheckError", message: "Every address check failed; is the email checker's balance or key gone?" }, { now });
  }
  return counts;
}
