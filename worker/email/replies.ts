import { activityForThreadReply, notifyActivity } from "../activity";
import { closeThread } from "../outreach/threads";

/**
 * They replied (N11; Decisions: Email tracking #6): mail from the person in
 * one of the user's open outreach threads marks the thread replied, which
 * stops its follow-ups, and sends "Marcus replied". Nothing of the email is
 * kept. Returns the threads it closed.
 */
export async function recordRecruiterReply(
  db: D1Database,
  userId: string,
  senderAddress: string,
  now = new Date()
): Promise<string[]> {
  const address = senderAddress.trim().toLowerCase();
  if (!address.includes("@")) return [];
  const threads = await db.prepare(
    `SELECT ot.id
     FROM outreach_threads ot
     JOIN company_contacts cc ON cc.id = ot.contact_id
     WHERE ot.user_id = ? AND ot.status IN ('active', 'finished') AND lower(cc.email) = ?`
  ).bind(userId, address).all<{ id: string }>();
  const closed: string[] = [];
  for (const { id } of threads.results ?? []) {
    await closeThread(db, userId, id, "replied", now, "email");
    const activity = await activityForThreadReply(db, id);
    if (activity) await notifyActivity(db, activity, now);
    closed.push(id);
  }
  return closed;
}
