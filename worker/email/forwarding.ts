import { getPrimaryIdentity } from "../auth";
import { sendForwardingStoppedEmail } from "../email";
import { inboxAddress } from "../../shared/email-tracking";
import { DEFAULT_TIME_ZONE, validTimeZone } from "../local-time";
import { kindEnabled, recordSentNotification } from "../notifications";
import type { Env } from "../types";

/*
 * Forwarding stopped (N18; Decisions: Email tracking #5): one nudge after 3
 * weeks without any mail, only for people who forward everything. A job-only
 * filter is often quiet for weeks, so what counts is a steady stream before
 * the silence: at least 30 emails, about two a day or more.
 */
export const FORWARDING_QUIET_DAYS = 21;
const MIN_EMAILS = 30;
const MIN_EMAILS_PER_DAY = 2;

export async function nudgeStoppedForwarding(env: Env, now = new Date()): Promise<number> {
  const quietSince = new Date(now.getTime() - FORWARDING_QUIET_DAYS * 86_400_000).toISOString();
  const rows = await env.DB.prepare(
    `SELECT ei.user_id, ei.tag, ei.last_email_at, u.time_zone
     FROM email_inboxes ei
     JOIN users u ON u.id = ei.user_id
     WHERE ei.last_email_at IS NOT NULL
       AND ei.last_email_at < ?
       AND ei.email_count >= ?
       AND ei.email_count >= ? * MAX(1, julianday(ei.last_email_at) - julianday(ei.first_email_at))
       AND (ei.forwarding_nudged_at IS NULL OR ei.forwarding_nudged_at < ei.last_email_at)
     LIMIT 100`
  ).bind(quietSince, MIN_EMAILS, MIN_EMAILS_PER_DAY)
    .all<{ user_id: string; tag: string; last_email_at: string; time_zone: string | null }>();

  let sent = 0;
  for (const row of rows.results ?? []) {
    // Claimed first, so it's one nudge per silence however the send goes.
    const claim = await env.DB.prepare(
      `UPDATE email_inboxes SET forwarding_nudged_at = ?
       WHERE user_id = ? AND (forwarding_nudged_at IS NULL OR forwarding_nudged_at < last_email_at)`
    ).bind(now.toISOString(), row.user_id).run();
    if (!claim.meta.changes) continue;
    if (!(await kindEnabled(env.DB, row.user_id, "forwarding_stopped"))) continue;
    const identity = await getPrimaryIdentity(env.DB, row.user_id);
    if (!identity?.email) continue;
    const address = inboxAddress(row.tag);
    const lastEmailDay = new Intl.DateTimeFormat("en-US", {
      timeZone: validTimeZone(row.time_zone, DEFAULT_TIME_ZONE), month: "long", day: "numeric",
    }).format(new Date(row.last_email_at));
    try {
      await sendForwardingStoppedEmail(env, { to: identity.email, address, lastEmailDay });
    } catch (error) {
      console.error("Forwarding-stopped email failed:", error instanceof Error ? error.message : String(error));
      continue;
    }
    await recordSentNotification(env.DB, {
      id: crypto.randomUUID(),
      userId: row.user_id,
      kind: "forwarding_stopped",
      dedupeKey: `forwarding_stopped:${row.last_email_at}`,
      payload: {
        title: "Your job emails stopped reaching Pinkslip",
        body: `Nothing since ${lastEmailDay}`,
        data: { url: "/you/email" },
      },
      devices: 0,
      sentAt: now,
    });
    sent += 1;
  }
  return sent;
}
