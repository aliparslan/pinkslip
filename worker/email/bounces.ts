import { stopThreadsTo } from "../outreach/threads";
import type { Sender } from "./rules";

/*
 * What the list learns from forwarded mail (docs/recruiter-contacts-sourcing.md,
 * "Keeping it clean"): a bounce, or an auto-reply saying the person left,
 * marks the address bad for everyone and stops follow-ups to it. An
 * out-of-office isn't a reply, so it no longer ends a thread. Only addresses
 * the user really wrote to count, so nobody can mark a stranger bad.
 */

const DAEMON = /^(mailer-daemon|postmaster|mail-daemon|mailerdaemon)@/i;
const BOUNCE_SUBJECT = /^(undeliverable|undelivered mail|delivery status notification \(failure\)|mail delivery failed|mail delivery subsystem|returned mail|delivery failure|failure notice|message not delivered|delivery has failed|address not found)/i;
const FORWARD_PREFIX = /^\s*((fwd?|fw)\s*:\s*)+/i;

export function isBounce(from: Sender, subject: string): boolean {
  const plain = subject.replace(FORWARD_PREFIX, "");
  // A delay notice from the daemon isn't a bounce: the mail may still arrive.
  return (DAEMON.test(from.address) || BOUNCE_SUBJECT.test(plain)) && !/\(delay\)|delayed/i.test(plain);
}

const AUTO_REPLY_SUBJECT = /^(automatic reply|auto(matic)?[- ]?reply|autoreply|out of (the )?office|ooo\b|away from (the )?office)/i;

export function isAutoReply(headers: Headers, subject: string): boolean {
  return /auto-replied/i.test(headers.get("auto-submitted") ?? "")
    || Boolean(headers.get("x-autoreply") || headers.get("x-autorespond"))
    || AUTO_REPLY_SUBJECT.test(subject.replace(FORWARD_PREFIX, ""));
}

/** "I'm no longer with Stripe", "Jane has left the company". */
export function saysTheyLeft(text: string): boolean {
  return /\bno longer (with|at|employed|working|part of)\b|\bhas left (the company|the organi[sz]ation|[A-Z])|\b(i|she|he|they) (have|has) left\b|\bmy last day (at|with|was)\b/i.test(text);
}

/** Contacts this user wrote to (any thread past a draft) at these addresses. */
async function writtenTo(db: D1Database, userId: string, addresses: string[]): Promise<string[]> {
  if (addresses.length === 0) return [];
  const rows = await db.prepare(
    `SELECT DISTINCT cc.id FROM company_contacts cc
     JOIN outreach_threads ot ON ot.contact_id = cc.id
     WHERE ot.user_id = ? AND ot.status != 'draft'
       AND cc.status NOT IN ('bounced', 'removed')
       AND lower(cc.email) IN (${addresses.map(() => "?").join(", ")})`
  ).bind(userId, ...addresses).all<{ id: string }>();
  return (rows.results ?? []).map((row) => row.id);
}

async function markGone(db: D1Database, contactIds: string[], now: Date): Promise<void> {
  for (const id of contactIds) {
    await db.prepare("UPDATE company_contacts SET status = 'bounced' WHERE id = ?").bind(id).run();
    await stopThreadsTo(db, id, now);
  }
}

/** A bounce the user's mail sent back: every address in it the user wrote to
 * is marked bounced. Returns the contacts marked. */
export async function recordBounce(db: D1Database, userId: string, text: string, now = new Date()): Promise<string[]> {
  const addresses = [...new Set([...text.matchAll(/[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+/gi)].map((match) => match[0].toLowerCase()))].slice(0, 50);
  const contacts = await writtenTo(db, userId, addresses);
  await markGone(db, contacts, now);
  return contacts;
}

/**
 * An auto-reply from someone the user wrote to. Returns false when the
 * sender isn't one, so the email goes on like any other (a company's
 * automatic "thanks for applying" is a step). Reads the text only then.
 */
export async function recordAutoReply(
  db: D1Database,
  userId: string,
  senderAddress: string,
  readText: () => Promise<string>,
  now = new Date(),
): Promise<boolean> {
  const contacts = await writtenTo(db, userId, [senderAddress.trim().toLowerCase()]);
  if (contacts.length === 0) return false;
  if (saysTheyLeft(await readText())) await markGone(db, contacts, now);
  return true;
}
