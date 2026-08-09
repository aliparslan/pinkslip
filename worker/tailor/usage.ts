const APP_USER_DAILY_LIMIT = 15;
const WORKERS_AI_GLOBAL_DAILY_REQUEST_LIMIT = 100;
const WORKERS_AI_RESERVATION_NEURONS = 500;
export const WORKERS_AI_DAILY_NEURON_LIMIT = 10_000;

function startOfUtcDay(date = new Date()) {
  return `${date.toISOString().slice(0, 10)}T00:00:00.000Z`;
}

export function nextUtcDay(date = new Date()) {
  const next = new Date(startOfUtcDay(date));
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString();
}

export async function loadTailorUsage(args: {
  db: D1Database;
  userId: string;
  model: string;
}) {
  const today = startOfUtcDay();
  const [app, user] = await Promise.all([
    args.db.prepare(
      `SELECT COUNT(*) AS count, COALESCE(SUM(provider_units), 0) AS provider_units
       FROM tailor_usage
       WHERE model = ?
         AND created_at >= ?`
    ).bind(args.model, today).first<{ count: number; provider_units: number }>(),
    args.db.prepare(
      `SELECT COUNT(*) AS count
       FROM tailor_usage
       WHERE user_id = ?
         AND model = ?
         AND created_at >= ?`
    ).bind(args.userId, args.model, today).first<{ count: number }>(),
  ]);

  const appToday = app?.count ?? 0;
  const userToday = user?.count ?? 0;
  const includedUserToday = userToday;
  const providerUnitsToday = app?.provider_units ?? 0;
  const providerUnitsLimit = WORKERS_AI_DAILY_NEURON_LIMIT;
  return {
    provider: "workers_ai" as const,
    model: args.model,
    app_today: appToday,
    user_today: userToday,
    included_user_today: includedUserToday,
    daily_limit: null,
    app_remaining: null,
    user_remaining: Math.max(0, APP_USER_DAILY_LIMIT - userToday),
    included_user_remaining: Math.max(0, APP_USER_DAILY_LIMIT - includedUserToday),
    provider_units_today: providerUnitsToday,
    provider_units_limit: providerUnitsLimit,
    provider_units_remaining: Math.max(0, providerUnitsLimit - providerUnitsToday),
    resets_at: nextUtcDay(),
  };
}

export async function reserveAppTailorQuota(
  db: D1Database,
  userId: string,
  model: string
): Promise<{ ok: true; usageId: string } | { ok: false; resets_at: string }> {
  const today = startOfUtcDay();
  const usageId = crypto.randomUUID();
  const reservedUnits = WORKERS_AI_RESERVATION_NEURONS;

  // One statement both checks and reserves quota, so concurrent requests cannot
  // all pass a count check before any one of them records usage.
  const result = await db.prepare(
    `INSERT INTO tailor_usage (
       id, user_id, model, created_at, provider_units
     )
     SELECT ?, ?, ?, ?, ?
     WHERE (
       SELECT COUNT(*) FROM tailor_usage
       WHERE user_id = ? AND created_at >= ?
     ) < ?
       AND (
         SELECT COUNT(*) FROM tailor_usage
         WHERE model = ? AND created_at >= ?
       ) < ?
       AND (
         SELECT COALESCE(SUM(provider_units), 0) FROM tailor_usage
         WHERE created_at >= ?
       ) + ? <= ?`
  ).bind(
    usageId,
    userId,
    model,
    new Date().toISOString(),
    reservedUnits,
    userId,
    today,
    APP_USER_DAILY_LIMIT,
    model,
    today,
    WORKERS_AI_GLOBAL_DAILY_REQUEST_LIMIT,
    today,
    reservedUnits,
    WORKERS_AI_DAILY_NEURON_LIMIT
  ).run();
  return (result.meta.changes ?? 0) === 0
    ? { ok: false, resets_at: nextUtcDay() }
    : { ok: true, usageId };
}

export async function completeAppTailorUsage(args: {
  db: D1Database;
  usageId: string;
  inputTokens: number;
  outputTokens: number;
  providerUnits: number | null;
}) {
  await args.db.prepare(
    `UPDATE tailor_usage
     SET input_tokens = ?, output_tokens = ?,
         provider_units = COALESCE(?, provider_units)
     WHERE id = ?`
  ).bind(
    args.inputTokens || null,
    args.outputTokens || null,
    args.providerUnits,
    args.usageId
  ).run();
}
