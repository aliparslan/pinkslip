import { deleteApplication } from "../applications";
import { getOrCreateInbox } from "../inbox";
import { DEFAULT_TIME_ZONE, localParts, validTimeZone, zonedTime } from "../local-time";
import type { Env } from "../types";
import { handleInboundEmail } from "./handler";

/*
 * Test emails for an admin's own inbox: a scripted run through every step,
 * fed to the same reader forwarded mail goes through (Cloudflare's delivery,
 * already proven, is the only part skipped). Three real catalog jobs at a
 * company the admin doesn't track:
 *
 * - Job A: receipt, a coding assessment with a deadline, then an interview
 *   with a calendar invite (Coming up, reminders, N3).
 * - Job B: receipt, then an offer (Needs you, N3).
 * - Job C: receipt, then a rejection that names no role, so Pinkslip asks
 *   "Which application?" (N4).
 * - A test outreach thread at the same company, and its recruiter's reply
 *   (N11).
 *
 * Everything it makes is marked by its sender and removed by clearTestEmails.
 */

export const TEST_SENDER = "ats-test@pinkslip.work";
export const TEST_RECRUITER = "recruiter-test@pinkslip.work";
export const TEST_CONTACT_SOURCE = "pinkslip-test";

interface TestJob {
  id: string;
  title: string;
  url: string;
}

export interface TestRun {
  company: string;
  jobs: string[];
  emails: Array<{ subject: string; outcome: string }>;
}

const ZONE_LABELS: Record<string, string> = {
  "America/New_York": "ET",
  "America/Chicago": "CT",
  "America/Denver": "MT",
  "America/Los_Angeles": "PT",
};

function message(to: string, raw: string): ForwardableEmailMessage {
  const bytes = new TextEncoder().encode(raw);
  const headers = new Headers();
  for (const line of raw.split("\r\n\r\n")[0]!.split("\r\n")) {
    const index = line.indexOf(":");
    if (index > 0) headers.append(line.slice(0, index), line.slice(index + 1).trim());
  }
  return {
    from: TEST_SENDER,
    to,
    headers,
    raw: new Response(bytes).body!,
    rawSize: bytes.length,
    setReject() {},
    forward: async () => ({}),
    reply: async () => ({}),
  } as unknown as ForwardableEmailMessage;
}

function mime(fields: { from: string; subject: string; id: string; date: Date }, body: string, calendar?: string): string {
  const head = [
    `From: ${fields.from}`,
    `To: you@example.com`,
    `Subject: ${fields.subject}`,
    `Message-ID: <${fields.id}@pinkslip.work>`,
    `Date: ${fields.date.toUTCString()}`,
    "MIME-Version: 1.0",
  ].join("\r\n");
  if (!calendar) return `${head}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${body}`;
  return `${head}\r\nContent-Type: multipart/mixed; boundary="pinkslip-test"\r\n\r\n`
    + `--pinkslip-test\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${body}\r\n`
    + `--pinkslip-test\r\nContent-Type: text/calendar; method=REQUEST; charset=utf-8\r\nContent-Disposition: attachment; filename="invite.ics"\r\n\r\n${calendar}\r\n--pinkslip-test--\r\n`;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** A local day `days` from now in the zone. */
function dayFromNow(now: Date, days: number, zone: string) {
  const local = localParts(new Date(now.getTime() + days * 86_400_000), zone);
  return { year: local.year, month: local.month, day: local.day };
}

/** Removes everything a test run made for this person. */
export async function clearTestEmails(env: Env, userId: string): Promise<number> {
  const emails = await env.DB.prepare(
    "SELECT id, application_id FROM inbound_emails WHERE user_id = ? AND sender_address = ?"
  ).bind(userId, TEST_SENDER).all<{ id: string; application_id: string | null }>();
  const emailIds = (emails.results ?? []).map((row) => row.id);
  const applicationIds = new Set((emails.results ?? []).flatMap((row) => row.application_id ? [row.application_id] : []));
  for (const emailId of emailIds) {
    const linked = await env.DB.prepare("SELECT DISTINCT application_id FROM application_events WHERE inbound_email_id = ?")
      .bind(emailId).all<{ application_id: string }>();
    for (const row of linked.results ?? []) applicationIds.add(row.application_id);
  }
  for (const applicationId of applicationIds) {
    await env.DB.prepare(
      "UPDATE notification_log SET status = 'skipped', error = 'Test cleared' WHERE status = 'scheduled' AND entity_id = ?"
    ).bind(applicationId).run();
    await deleteApplication(env.DB, applicationId);
  }
  await env.DB.prepare("DELETE FROM inbound_emails WHERE user_id = ? AND sender_address = ?").bind(userId, TEST_SENDER).run();
  await env.DB.prepare(
    `DELETE FROM outreach_threads WHERE user_id = ?
     AND contact_id IN (SELECT id FROM company_contacts WHERE source = ?)`
  ).bind(userId, TEST_CONTACT_SOURCE).run();
  await env.DB.prepare(
    `DELETE FROM company_contacts WHERE source = ?
     AND NOT EXISTS (SELECT 1 FROM outreach_threads ot WHERE ot.contact_id = company_contacts.id)`
  ).bind(TEST_CONTACT_SOURCE).run();
  return applicationIds.size;
}

export async function sendTestEmails(env: Env, userId: string, now = new Date()): Promise<TestRun> {
  await clearTestEmails(env, userId);
  const db = env.DB;
  const company = await db.prepare(
    `SELECT c.id, c.name, c.website
     FROM companies c
     WHERE c.enabled = 1 AND c.ats_type IN ('greenhouse', 'lever', 'ashby')
       AND NOT EXISTS (
         SELECT 1 FROM applications a JOIN jobs j ON j.id = a.job_id
         WHERE a.user_id = ? AND j.company_id = c.id
       )
       AND (SELECT COUNT(DISTINCT j.title) FROM jobs j WHERE j.company_id = c.id AND j.closed_at IS NULL AND j.url != '') >= 3
     ORDER BY c.name
     LIMIT 1`
  ).bind(userId).first<{ id: string; name: string; website: string }>();
  if (!company) throw new Error("No catalog company to test with");
  const rows = await db.prepare(
    `SELECT id, title, url FROM jobs
     WHERE company_id = ? AND closed_at IS NULL AND url != ''
     ORDER BY first_seen_at DESC
     LIMIT 50`
  ).bind(company.id).all<TestJob>();
  const jobs: TestJob[] = [];
  for (const job of rows.results ?? []) {
    if (!jobs.some((picked) => picked.title.toLowerCase() === job.title.toLowerCase())) jobs.push(job);
    if (jobs.length === 3) break;
  }
  const [a, b, c] = jobs as [TestJob, TestJob, TestJob];

  const inbox = await getOrCreateInbox(db, userId);
  const user = await db.prepare("SELECT time_zone FROM users WHERE id = ?").bind(userId).first<{ time_zone: string | null }>();
  const zone = validTimeZone(user?.time_zone, DEFAULT_TIME_ZONE);
  const label = ZONE_LABELS[zone];
  const run = crypto.randomUUID().slice(0, 8);
  const from = `${company.name} Recruiting <${TEST_SENDER}>`;
  const sent: TestRun["emails"] = [];
  let step = 0;
  const deliver = async (sender: string, subject: string, body: string, calendar?: string) => {
    step += 1;
    const raw = mime({ from: sender, subject, id: `pinkslip-test-${run}-${step}`, date: new Date(now.getTime() + step * 1000) }, body, calendar);
    await handleInboundEmail(message(inbox.address, raw), env);
    const record = await db.prepare(
      "SELECT status FROM inbound_emails WHERE user_id = ? AND subject = ? AND sender_address = ? ORDER BY created_at DESC LIMIT 1"
    ).bind(userId, subject, TEST_SENDER).first<{ status: string }>();
    sent.push({ subject, outcome: record?.status ?? (sender.includes(TEST_RECRUITER) ? "reply" : "ignored") });
  };

  for (const job of [a, b, c]) {
    await deliver(from, `Thank you for applying to ${company.name}`,
      `Hi,\n\nThank you for applying for the ${job.title} role at ${company.name}. We've received your application and our team will review it.\n\n${job.url}\n\n${company.name} Recruiting`);
  }

  // Job A: an assessment with a deadline 4 days out, then an interview in 2 days.
  const deadline = dayFromNow(now, 4, zone);
  const deadlineText = label
    ? `${new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: zone }).format(zonedTime(deadline.year, deadline.month, deadline.day, 12, zone))} at 11:59 PM ${label}`
    : `${new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(deadline.year, deadline.month - 1, deadline.day, 12)))} at 11:59 PM UTC`;
  await deliver(from, `${company.name} coding assessment: ${a.title}`,
    `Hi,\n\nWe'd like to invite you to complete a coding assessment for the ${a.title} role. Please complete it by ${deadlineText}.\n\n${a.url}`);
  const interview = dayFromNow(now, 2, zone);
  const ics = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Pinkslip test//EN", "METHOD:REQUEST", "BEGIN:VEVENT",
    `DTSTART;TZID=${zone}:${interview.year}${pad(interview.month)}${pad(interview.day)}T110000`,
    `SUMMARY:${company.name} Interview: ${a.title}`, `UID:pinkslip-test-${run}@pinkslip.work`, "END:VEVENT", "END:VCALENDAR",
  ].join("\r\n");
  await deliver(from, `Interview confirmed: ${a.title} at ${company.name}`,
    `Hi,\n\nYour interview for the ${a.title} role has been scheduled. The calendar invite has the details.\n\n${a.url}`, ics);

  // Job B: an offer.
  await deliver(from, `Your offer from ${company.name}`,
    `Hi,\n\nWe're thrilled to extend you an offer for the ${b.title} role! Your offer letter is attached.\n\n${b.url}`);

  // A rejection that names no role: with three open applications there, it asks.
  await deliver(from, `An update on your application to ${company.name}`,
    "Hi,\n\nThank you for your time and interest. Unfortunately, we will not be moving forward with your application.\n\nBest of luck in your search.");

  // A recruiter's reply to a test outreach thread.
  const stamp = now.toISOString();
  const contactId = crypto.randomUUID();
  const threadId = crypto.randomUUID();
  await db.batch([
    db.prepare(
      `INSERT INTO company_contacts (id, company_id, email, name, title, source, created_at)
       VALUES (?, ?, ?, 'Marcus Lee', 'University Recruiter', ?, ?)
       ON CONFLICT(company_id, email) DO NOTHING`
    ).bind(contactId, company.id, TEST_RECRUITER, TEST_CONTACT_SOURCE, stamp),
    db.prepare(
      `INSERT INTO outreach_threads (id, user_id, company_id, job_id, contact_id, status, created_at, updated_at)
       SELECT ?, ?, ?, ?, id, 'active', ?, ? FROM company_contacts WHERE company_id = ? AND email = ?`
    ).bind(threadId, userId, company.id, a.id, stamp, stamp, company.id, TEST_RECRUITER),
    db.prepare(
      `INSERT INTO outreach_messages (id, thread_id, step, subject, body, status, due_at, sent_at, created_at, updated_at)
       VALUES (?, ?, 0, 'Hello from a Pinkslip test', 'Hi Marcus', 'sent', NULL, ?, ?, ?),
              (?, ?, 1, 'Following up', 'Hi Marcus', 'scheduled', ?, NULL, ?, ?)`
    ).bind(
      crypto.randomUUID(), threadId, stamp, stamp, stamp,
      crypto.randomUUID(), threadId, new Date(now.getTime() + 3 * 86_400_000).toISOString(), stamp, stamp
    ),
  ]);
  await deliver(`Marcus Lee <${TEST_RECRUITER}>`, "Re: Hello from a Pinkslip test", "Hi! Thanks for reaching out. Happy to chat next week.");

  return { company: company.name, jobs: jobs.map((job) => job.title), emails: sent };
}

/** Requests left in preferences ("test_emails:<user id>" = "send" or "clear") run on the next tick. */
export async function runRequestedTestEmails(env: Env, now = new Date()): Promise<number> {
  const requests = await env.DB.prepare("SELECT key, value FROM preferences WHERE key LIKE 'test_emails:%'")
    .all<{ key: string; value: string }>();
  let ran = 0;
  for (const request of requests.results ?? []) {
    await env.DB.prepare("DELETE FROM preferences WHERE key = ?").bind(request.key).run();
    const userId = request.key.slice("test_emails:".length);
    const admin = await env.DB.prepare("SELECT role FROM users WHERE id = ?").bind(userId).first<{ role: string }>();
    if (admin?.role !== "admin") continue;
    try {
      if (request.value === "clear") await clearTestEmails(env, userId);
      else console.log(JSON.stringify({ event: "test_emails", ...(await sendTestEmails(env, userId, now)) }));
      ran += 1;
    } catch (error) {
      console.error("Test emails failed:", error instanceof Error ? error.message : String(error));
    }
  }
  return ran;
}
