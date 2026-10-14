import { inboxAddress, type Inbox } from "../shared/email-tracking";

/* Each signed-in user's forwarding address: inbox+<tag>@pinkslip.work. */

interface InboxRow {
  user_id: string;
  tag: string;
  created_at: string;
  forwarding_confirmed_at: string | null;
  forwarding_code: string | null;
  forwarding_link: string | null;
  last_email_at: string | null;
}

// No 0/o or 1/l, so a tag read aloud or retyped stays right.
const TAG_ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789";
const TAG_LENGTH = 10;

export function newInboxTag(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(TAG_LENGTH));
  return Array.from(bytes, (byte) => TAG_ALPHABET[byte % TAG_ALPHABET.length]).join("");
}

function serialize(row: InboxRow): Inbox {
  return {
    address: inboxAddress(row.tag),
    forwarding: {
      confirmed_at: row.forwarding_confirmed_at,
      code: row.forwarding_confirmed_at ? null : row.forwarding_code,
      link: row.forwarding_confirmed_at ? null : row.forwarding_link,
    },
    last_email_at: row.last_email_at,
  };
}

/** The user's inbox, created on first use. */
export async function getOrCreateInbox(db: D1Database, userId: string): Promise<Inbox> {
  await db.prepare(
    "INSERT OR IGNORE INTO email_inboxes (user_id, tag, created_at) VALUES (?, ?, ?)"
  ).bind(userId, newInboxTag(), new Date().toISOString()).run();
  const row = await db.prepare("SELECT * FROM email_inboxes WHERE user_id = ?").bind(userId).first<InboxRow>();
  if (!row) throw new Error("Inbox was not created");
  return serialize(row);
}

/** A new address; the old one stops working, so forwarding is set up again. */
export async function rotateInbox(db: D1Database, userId: string): Promise<Inbox> {
  await getOrCreateInbox(db, userId);
  await db.prepare(
    `UPDATE email_inboxes
     SET tag = ?, forwarding_confirmed_at = NULL, forwarding_code = NULL, forwarding_link = NULL
     WHERE user_id = ?`
  ).bind(newInboxTag(), userId).run();
  return getOrCreateInbox(db, userId);
}

export async function findInboxUser(db: D1Database, tag: string): Promise<string | null> {
  const row = await db.prepare("SELECT user_id FROM email_inboxes WHERE tag = ?")
    .bind(tag.toLowerCase())
    .first<{ user_id: string }>();
  return row?.user_id ?? null;
}

export async function recordForwardingConfirmation(
  db: D1Database,
  userId: string,
  confirmation: { code: string | null; link: string | null }
): Promise<void> {
  await db.prepare(
    "UPDATE email_inboxes SET forwarding_code = ?, forwarding_link = ? WHERE user_id = ?"
  ).bind(confirmation.code, confirmation.link, userId).run();
}

/** Any forwarded email after the confirmation proves forwarding works. */
export async function recordInboxDelivery(db: D1Database, userId: string, now: string): Promise<void> {
  await db.prepare(
    `UPDATE email_inboxes
     SET last_email_at = ?,
         forwarding_confirmed_at = COALESCE(forwarding_confirmed_at, ?),
         forwarding_code = NULL,
         forwarding_link = NULL
     WHERE user_id = ?`
  ).bind(now, now, userId).run();
}
