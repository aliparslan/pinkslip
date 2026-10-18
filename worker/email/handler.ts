import PostalMime, { addressParser, decodeWords, type Email } from "postal-mime";
import { activityForEmail, notifyActivity } from "../activity";
import { findInboxUser, recordForwardingConfirmation, recordInboxDelivery } from "../inbox";
import { recordRecruiterReply } from "./replies";
import { readStageWithAi } from "./stage-reader";
import type { Env } from "../types";
import { hashMessage, processEmail, trackedCompanies } from "./process";
import {
  domainOf,
  isGmailForwardingConfirmation,
  isManualForward,
  parseGmailForwardingConfirmation,
  parseInboxTag,
  shouldOpen,
  unwrapForward,
  type EmailContent,
  type Sender,
} from "./rules";

/*
 * Cloudflare Email Routing hands every message sent to inbox+<tag>@pinkslip.work
 * to this handler. It reads the message in memory and keeps only what it says
 * about the user's applications. See docs/email-tracking.md.
 */

/** Hiring mail is small; anything larger is mostly attachments we don't read. */
const MAX_EMAIL_BYTES = 5 * 1024 * 1024;

function firstMailbox(header: string | null, fallback: string): Sender {
  for (const entry of header ? addressParser(header) : []) {
    const mailbox = "group" in entry && entry.group ? entry.group[0] : entry;
    if (mailbox?.address) return { name: decodeWords(mailbox.name ?? "").trim(), address: mailbox.address.toLowerCase() };
  }
  return { name: "", address: fallback.toLowerCase() };
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " ", "#39": "'" };

export function htmlToText(html: string): string {
  return html
    .replace(/<(style|script|head)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>|<\/(p|div|tr|li|h[1-6]|table)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (entity, code: string) => {
      const lower = code.toLowerCase();
      if (lower.startsWith("#x")) return String.fromCodePoint(Number.parseInt(lower.slice(2), 16) || 32);
      if (lower.startsWith("#")) return ENTITIES[lower] ?? String.fromCodePoint(Number(lower.slice(1)) || 32);
      return ENTITIES[lower] ?? entity;
    })
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/\n\s*\n+/g, "\n\n")
    .trim();
}

export function extractLinks(html: string, text: string): string[] {
  const links = new Set<string>();
  for (const match of html.matchAll(/href\s*=\s*["']([^"']+)["']/gi)) links.add(match[1]!.replace(/&amp;/g, "&"));
  for (const match of text.matchAll(/https?:\/\/[^\s<>"')\]]+/gi)) links.add(match[0]);
  return [...links].filter((href) => /^https?:\/\//i.test(href)).slice(0, 500);
}

export function toEmailContent(parsed: Email, fallbackFrom: Sender): EmailContent {
  const html = parsed.html ?? "";
  const text = parsed.text?.trim() ? parsed.text : htmlToText(html);
  const from = parsed.from && "address" in parsed.from && parsed.from.address
    ? { name: parsed.from.name ?? "", address: parsed.from.address.toLowerCase() }
    : fallbackFrom;
  return {
    from,
    subject: parsed.subject ?? "",
    date: parsed.date ?? null,
    text,
    links: extractLinks(html, text),
    calendar: calendarParts(parsed),
  };
}

/** Calendar invites (scheduling tools attach one), as text, small ones only. */
function calendarParts(parsed: Email): string[] {
  return (parsed.attachments ?? [])
    .filter((attachment) => /calendar/i.test(attachment.mimeType ?? "") || /\.ics$/i.test(attachment.filename ?? ""))
    .map((attachment) => typeof attachment.content === "string"
      ? attachment.content
      : new TextDecoder().decode(attachment.content as ArrayBuffer))
    .filter((content) => content.length <= 100_000)
    .slice(0, 3);
}

/**
 * What happened to an email, for Worker logs: the outcome and the sender's
 * domain, never the address, subject or text. Explains "it wasn't reflected".
 */
function logOutcome(outcome: string, senderAddress: string) {
  console.log(JSON.stringify({ event: "inbound_email", outcome, sender_domain: domainOf(senderAddress) }));
}

export async function handleInboundEmail(message: ForwardableEmailMessage, env: Env): Promise<void> {
  const tag = parseInboxTag(message.to);
  if (!tag || message.rawSize > MAX_EMAIL_BYTES) return;
  const userId = await findInboxUser(env.DB, tag);
  if (!userId) return;

  const from = firstMailbox(message.headers.get("from"), message.from);
  const subject = decodeWords(message.headers.get("subject") ?? "");
  const now = new Date().toISOString();

  if (isGmailForwardingConfirmation(from, subject)) {
    const parsed = toEmailContent(await PostalMime.parse(message.raw), from);
    await recordForwardingConfirmation(env.DB, userId, parseGmailForwardingConfirmation(parsed));
    return;
  }

  await recordInboxDelivery(env.DB, userId, now);
  const forwarded = isManualForward(subject);
  // A reply from someone the user wrote to (N11), decided from the sender
  // alone. A forward the user sent by hand is checked by its original sender
  // below: the forwarder is the user, never the recruiter. A reply can also
  // be a step (an interview invite), so it goes on either way.
  if (!forwarded) await recordRecruiterReply(env.DB, userId, from.address);
  // Decided from the headers alone: mail that isn't about a job is never parsed.
  if (!shouldOpen({ from, subject }, await trackedCompanies(env.DB, userId))) {
    logOutcome("not_opened", from.address);
    return;
  }

  const parsed = await PostalMime.parse(message.raw);
  const email = unwrapForward(toEmailContent(parsed, from));
  if (forwarded && email.from.address !== from.address) await recordRecruiterReply(env.DB, userId, email.from.address);
  const hash = await hashMessage(parsed.messageId ?? message.headers.get("message-id"), email);
  // Rules first; Jev reads only hiring mail the rules can't place (stage-reader.ts).
  const outcome = await processEmail(env.DB, userId, email, hash, now, (content) => readStageWithAi(env, content));
  logOutcome(outcome.status === "ignored" ? outcome.reason ?? "ignored" : outcome.status, email.from.address);
  // Notifications start from what the email wrote to the Activity stream:
  // an application it moved (N3) or "which application?" (N4).
  if ("emailId" in outcome) {
    for (const activity of await activityForEmail(env.DB, outcome.emailId)) {
      await notifyActivity(env.DB, activity);
    }
  }
}
