import {
  ALLOWANCE_LABELS, APPLE_PRO_PRODUCTS, PLAN_ALLOWANCES, PRO_PRICES_USD, PRO_TRIAL_DAYS,
  type Allowance, type AllowanceKind, type AllowanceRule, type PlanName, type PlanSource, type PlanState,
} from "../shared/plans";
import { appleSubscriptions, type AppleEnvironment, type AppleStoreConfig, type AppleSubscription } from "./apple-store";
import { localParts, validTimeZone, zonedTime } from "./local-time";
import type { Env } from "./types";

interface PlanRow {
  plan: PlanName;
  source: PlanSource;
  period: "week" | "month" | null;
  started_at: string;
  ends_at: string | null;
  will_renew: number;
  trial_used_at: string | null;
  external_id: string | null;
}

/** Someone's plan right now (step 9). No row, or a Pro that has ended, is
 * Free. */
export async function currentPlan(env: Env, userId: string, now = new Date()): Promise<{
  plan: PlanName;
  source: PlanSource | null;
  row: PlanRow | null;
}> {
  const row = await env.DB.prepare(
    `SELECT plan, source, period, started_at, ends_at, will_renew, trial_used_at, external_id
     FROM user_plans WHERE user_id = ?`
  ).bind(userId).first<PlanRow>();
  if (row?.plan === "pro" && (row.ends_at === null || row.ends_at > now.toISOString())) {
    return { plan: "pro", source: row.source, row };
  }
  return { plan: "free", source: null, row };
}

/** Where an allowance's window starts and when it resets, in the person's
 * time zone: local midnight for a day, Monday's for a week. */
export function allowanceWindow(per: AllowanceRule["per"], timeZone: string, now = new Date()): { since: string; resetsAt: string } {
  const { year, month, day } = localParts(now, timeZone);
  // Days since Monday, from the local date's weekday.
  const back = per === "day" ? 0 : (new Date(Date.UTC(year, month - 1, day)).getUTCDay() + 6) % 7;
  const length = per === "day" ? 1 : 7;
  return {
    since: zonedTime(year, month, day - back, 0, timeZone).toISOString(),
    resetsAt: zonedTime(year, month, day - back + length, 0, timeZone).toISOString(),
  };
}

async function timeZoneOf(db: D1Database, userId: string): Promise<string> {
  const row = await db.prepare("SELECT time_zone FROM users WHERE id = ?").bind(userId).first<{ time_zone: string | null }>();
  return validTimeZone(row?.time_zone ?? undefined);
}

/** How much of each allowance is used in its window. Tailoring counts
 * tailor_usage (its own ledger, refunds excluded); the rest count
 * usage_ledger. */
async function usedSince(db: D1Database, userId: string, kind: AllowanceKind, since: string): Promise<number> {
  const row = kind === "tailoring"
    ? await db.prepare(
      `SELECT COUNT(*) AS used FROM tailor_usage WHERE user_id = ? AND state <> 'refunded' AND created_at >= ?`
    ).bind(userId, since).first<{ used: number }>()
    : await db.prepare(
      `SELECT COUNT(*) AS used FROM usage_ledger WHERE user_id = ? AND kind = ? AND released_at IS NULL AND created_at >= ?`
    ).bind(userId, kind, since).first<{ used: number }>();
  return row?.used ?? 0;
}

/** One allowance for someone on their plan: its rule, window and use. */
export async function allowanceFor(env: Env, userId: string, kind: AllowanceKind, now = new Date()): Promise<Allowance & { since: string }> {
  const [{ plan }, timeZone] = await Promise.all([currentPlan(env, userId, now), timeZoneOf(env.DB, userId)]);
  const rule = PLAN_ALLOWANCES[plan][kind];
  const { since, resetsAt } = allowanceWindow(rule.per, timeZone, now);
  const used = await usedSince(env.DB, userId, kind, since);
  return {
    kind, label: ALLOWANCE_LABELS[kind], used, limit: rule.limit, per: rule.per, quiet: rule.quiet ?? false,
    resets_at: resetsAt, since,
  };
}

/** GET /api/v2/plan: the plan, the trial, the prices and every allowance. */
export async function planState(env: Env, userId: string, now = new Date()): Promise<PlanState> {
  const current = await currentPlan(env, userId, now);
  const allowances = await Promise.all((Object.keys(PLAN_ALLOWANCES[current.plan]) as AllowanceKind[])
    .map((kind) => allowanceFor(env, userId, kind, now)));
  const paid = current.plan === "pro" ? current.row : null;
  const offer = current.plan === "pro"
    ? await env.DB.prepare(
      `SELECT id, company_name FROM applications WHERE user_id = ? AND stage = 'offer' ORDER BY stage_changed_at DESC LIMIT 1`
    ).bind(userId).first<{ id: string; company_name: string | null }>()
    : null;
  return {
    plan: current.plan,
    source: current.source,
    period: paid?.period ?? null,
    ends_at: paid?.ends_at ?? null,
    will_renew: Boolean(paid?.will_renew),
    trial: { available: !current.row?.trial_used_at, days: PRO_TRIAL_DAYS },
    prices: { currency: "usd", ...PRO_PRICES_USD },
    allowances: allowances.map(({ since: _since, ...allowance }) => allowance),
    offer_application: offer ? { id: offer.id, company_name: offer.company_name } : null,
  };
}

export type ReserveResult = { ok: true; id: string } | { ok: false; limit: number; resets_at: string };

/** Takes one use of an allowance (an auto-apply send), atomically: the count
 * check and the insert are one statement, so parallel sends can't all pass.
 * Release it if the use didn't happen. Tailoring reserves through
 * reserveAppTailorQuota with the same allowance. */
export async function reserveAllowance(env: Env, userId: string, kind: Exclude<AllowanceKind, "tailoring">, refId: string | null, now = new Date()): Promise<ReserveResult> {
  const allowance = await allowanceFor(env, userId, kind, now);
  const id = crypto.randomUUID();
  const result = await env.DB.prepare(
    `INSERT INTO usage_ledger (id, user_id, kind, ref_id, created_at)
     SELECT ?, ?, ?, ?, ?
     WHERE (SELECT COUNT(*) FROM usage_ledger WHERE user_id = ? AND kind = ? AND released_at IS NULL AND created_at >= ?) < ?`
  ).bind(id, userId, kind, refId, now.toISOString(), userId, kind, allowance.since, allowance.limit).run();
  return (result.meta.changes ?? 0) > 0 ? { ok: true, id } : { ok: false, limit: allowance.limit, resets_at: allowance.resets_at };
}

export async function releaseAllowance(db: D1Database, id: string, now = new Date()): Promise<void> {
  await db.prepare("UPDATE usage_ledger SET released_at = ? WHERE id = ? AND released_at IS NULL").bind(now.toISOString(), id).run();
}

/** An admin gives someone Pro (with an end, or none) or puts them back on
 * Free. Payments set the same row later. The trial stays used if it was. */
export async function setPlanByAdmin(db: D1Database, userId: string, plan: PlanName, endsAt: string | null, now = new Date()): Promise<void> {
  const stamp = now.toISOString();
  await db.prepare(
    `INSERT INTO user_plans (user_id, plan, source, period, started_at, ends_at, will_renew, updated_at)
     VALUES (?, ?, 'admin', NULL, ?, ?, 0, ?)
     ON CONFLICT(user_id) DO UPDATE SET plan = excluded.plan, source = 'admin', period = NULL,
       started_at = excluded.started_at, ends_at = excluded.ends_at, will_renew = 0, external_id = NULL,
       updated_at = excluded.updated_at`
  ).bind(userId, plan, stamp, plan === "pro" ? endsAt : null, stamp).run();
}

/** Signing in with a guest's data: the guest's Pro (bought before signing
 * in) carries over when the account has none that lasts longer, and a used
 * trial stays used. Usage moves with the person. */
export async function mergeGuestPlan(db: D1Database, sourceUserId: string, targetUserId: string, now = new Date()): Promise<void> {
  const [source, target] = await Promise.all([sourceUserId, targetUserId].map((id) => db.prepare(
    `SELECT plan, source, period, started_at, ends_at, will_renew, trial_used_at, external_id FROM user_plans WHERE user_id = ?`
  ).bind(id).first<PlanRow>()));
  const active = (row: PlanRow | null) => row?.plan === "pro" && (row.ends_at === null || row.ends_at > now.toISOString());
  const lasts = (row: PlanRow) => row.ends_at ?? "9999";
  const statements = [db.prepare("UPDATE usage_ledger SET user_id = ? WHERE user_id = ?").bind(targetUserId, sourceUserId)];
  if (source) {
    const trialUsed = target?.trial_used_at ?? source.trial_used_at;
    // A Free row is still worth keeping when it records a used trial.
    const keep = (active(source) && (!active(target) || lasts(source) > lasts(target!)) ? source : target)
      ?? (trialUsed ? { plan: "free", source: "admin", period: null, started_at: now.toISOString(), ends_at: null, will_renew: 0, trial_used_at: trialUsed, external_id: null } satisfies PlanRow : null);
    if (keep) {
      statements.push(db.prepare(
        `INSERT INTO user_plans (user_id, plan, source, period, started_at, ends_at, will_renew, trial_used_at, external_id, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET plan = excluded.plan, source = excluded.source, period = excluded.period,
           started_at = excluded.started_at, ends_at = excluded.ends_at, will_renew = excluded.will_renew,
           trial_used_at = excluded.trial_used_at, external_id = excluded.external_id, updated_at = excluded.updated_at`
      ).bind(targetUserId, keep.plan, keep.source, keep.period, keep.started_at, keep.ends_at, keep.will_renew, trialUsed, keep.external_id, now.toISOString()));
    }
    statements.push(db.prepare("DELETE FROM user_plans WHERE user_id = ?").bind(sourceUserId));
  }
  await db.batch(statements);
}

const iso = (ms: number | undefined) => (ms === undefined ? null : new Date(ms).toISOString());

/** Pro's subscription among what Apple returned: the one that gives access
 * now (active or in the grace period), else the one that ended last. */
export function proSubscription(subscriptions: AppleSubscription[]): AppleSubscription | null {
  const ours = subscriptions.filter((subscription) => APPLE_PRO_PRODUCTS[subscription.transaction.productId]);
  const live = ours.find((subscription) => subscription.status === 1 || subscription.status === 4);
  return live ?? ours.sort((a, b) => (b.transaction.expiresDate ?? 0) - (a.transaction.expiresDate ?? 0))[0] ?? null;
}

/** Writes what Apple says onto someone's plan: Pro while the subscription is
 * active or in its grace period (until its end, which a renewal moves), Free
 * once it has expired, failed to renew or been refunded. A free trial is
 * the trial source and marks the trial used. An admin's Pro isn't taken
 * away by an Apple subscription ending. */
export async function applyAppleSubscription(db: D1Database, userId: string, subscription: AppleSubscription, now = new Date()): Promise<void> {
  const { status, transaction, renewal } = subscription;
  const pro = status === 1 || status === 4;
  const trial = transaction.offerType === 1 && transaction.offerDiscountType === "FREE_TRIAL";
  const endsAt = status === 4 && renewal?.gracePeriodExpiresDate ? iso(renewal.gracePeriodExpiresDate) : iso(transaction.expiresDate);
  const existing = await db.prepare(
    `SELECT plan, source, ends_at, trial_used_at FROM user_plans WHERE user_id = ?`
  ).bind(userId).first<{ plan: PlanName; source: PlanSource; ends_at: string | null; trial_used_at: string | null }>();
  const trialUsedAt = existing?.trial_used_at ?? (trial ? iso(transaction.purchaseDate) : null);
  const adminPro = existing?.source === "admin" && existing.plan === "pro" && (existing.ends_at === null || existing.ends_at > now.toISOString());
  if (adminPro && !pro) {
    await db.prepare("UPDATE user_plans SET trial_used_at = ?, updated_at = ? WHERE user_id = ?").bind(trialUsedAt, now.toISOString(), userId).run();
    return;
  }
  await db.prepare(
    `INSERT INTO user_plans (user_id, plan, source, period, started_at, ends_at, will_renew, trial_used_at, external_id, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET plan = excluded.plan, source = excluded.source, period = excluded.period,
       started_at = excluded.started_at, ends_at = excluded.ends_at, will_renew = excluded.will_renew,
       trial_used_at = excluded.trial_used_at, external_id = excluded.external_id, updated_at = excluded.updated_at`
  ).bind(
    userId, pro ? "pro" : "free", trial ? "trial" : "apple", APPLE_PRO_PRODUCTS[transaction.productId] ?? null,
    iso(transaction.originalPurchaseDate) ?? now.toISOString(), endsAt, renewal?.autoRenewStatus === 1 ? 1 : 0,
    trialUsedAt, transaction.originalTransactionId, now.toISOString(),
  ).run();
}

export type AppleSyncResult =
  | { ok: true; userId: string; pro: boolean }
  | { ok: false; code: "not_found" | "not_pro" | "owned_elsewhere" | "no_owner" };

/** Asks Apple about a transaction and updates whoever owns it: the account
 * already holding that subscription, else the one asking (a purchase or a
 * restore), else the user id the app put on the purchase (a notification).
 * A subscription another account holds isn't moved. */
export async function syncAppleSubscription(
  db: D1Database,
  config: AppleStoreConfig,
  input: { transactionId: string; userId?: string; prefer?: AppleEnvironment; fetcher?: typeof fetch; now?: Date },
): Promise<AppleSyncResult> {
  const found = await appleSubscriptions(config, input.transactionId, { prefer: input.prefer, fetcher: input.fetcher });
  if (!found) return { ok: false, code: "not_found" };
  const subscription = proSubscription(found.subscriptions);
  if (!subscription) return { ok: false, code: "not_pro" };
  const holder = await db.prepare("SELECT user_id FROM user_plans WHERE external_id = ?")
    .bind(subscription.transaction.originalTransactionId).first<{ user_id: string }>();
  if (input.userId && holder && holder.user_id !== input.userId) return { ok: false, code: "owned_elsewhere" };
  const token = subscription.transaction.appAccountToken;
  const tokenOwner = !holder && !input.userId && token
    ? await db.prepare("SELECT id FROM users WHERE id = ?").bind(token).first<{ id: string }>()
    : null;
  const owner = holder?.user_id ?? input.userId ?? tokenOwner?.id;
  if (!owner) return { ok: false, code: "no_owner" };
  await applyAppleSubscription(db, owner, subscription, input.now);
  return { ok: true, userId: owner, pro: subscription.status === 1 || subscription.status === 4 };
}

