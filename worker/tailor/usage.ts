export type TailorProvider = "gemini" | "anthropic" | "workers_ai";
export type TailorKeySource = "app" | "user";

export const GEMINI_DAILY_LIMITS: Record<string, number> = {
  "gemini-3.1-flash-lite": 500,
  "gemini-3-flash": 20,
  "gemini-2.5-flash": 20,
  "gemini-2.5-flash-lite": 20,
};

const APP_USER_DAILY_LIMIT = 15;
const APP_GLOBAL_DAILY_FALLBACK = 1000;
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

export async function recordTailorUsage(args: {
  db?: D1Database;
  userId: string;
  keySource: TailorKeySource;
  provider: TailorProvider;
  model: string;
  inputTokens?: number | null;
  outputTokens?: number | null;
  providerUnits?: number | null;
}) {
  if (!args.db) return;
  await args.db.prepare(
    `INSERT INTO tailor_usage (
       id, user_id, key_source, provider, model, created_at,
       input_tokens, output_tokens, provider_units
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    crypto.randomUUID(),
    args.userId,
    args.keySource,
    args.provider,
    args.model,
    new Date().toISOString(),
    args.inputTokens ?? null,
    args.outputTokens ?? null,
    args.providerUnits ?? null
  ).run();
}

export async function loadTailorUsage(args: {
  db: D1Database;
  userId: string;
  provider: TailorProvider;
  model: string;
}) {
  const today = startOfUtcDay();
  const [app, user, includedUser] = await Promise.all([
    args.db.prepare(
      `SELECT COUNT(*) AS count, COALESCE(SUM(provider_units), 0) AS provider_units
       FROM tailor_usage
       WHERE key_source = 'app'
         AND provider = ?
         AND model = ?
         AND created_at >= ?`
    ).bind(args.provider, args.model, today).first<{ count: number; provider_units: number }>(),
    args.db.prepare(
      `SELECT COUNT(*) AS count
       FROM tailor_usage
       WHERE user_id = ?
         AND provider = ?
         AND model = ?
         AND created_at >= ?`
    ).bind(args.userId, args.provider, args.model, today).first<{ count: number }>(),
    args.db.prepare(
      `SELECT COUNT(*) AS count
       FROM tailor_usage
       WHERE key_source = 'app'
         AND user_id = ?
         AND created_at >= ?`
    ).bind(args.userId, today).first<{ count: number }>(),
  ]);

  const dailyLimit = args.provider === "gemini" ? GEMINI_DAILY_LIMITS[args.model] ?? null : null;
  const appToday = app?.count ?? 0;
  const userToday = user?.count ?? 0;
  const includedUserToday = includedUser?.count ?? 0;
  const providerUnitsToday = app?.provider_units ?? 0;
  const providerUnitsLimit = args.provider === "workers_ai"
    ? WORKERS_AI_DAILY_NEURON_LIMIT
    : null;
  return {
    provider: args.provider,
    model: args.model,
    app_today: appToday,
    user_today: userToday,
    included_user_today: includedUserToday,
    daily_limit: dailyLimit,
    app_remaining: dailyLimit === null ? null : Math.max(0, dailyLimit - appToday),
    // Keep the legacy aggregate field stable for existing web clients. Native
    // uses the explicit included-only fields for its free-use meter.
    user_remaining: Math.max(0, APP_USER_DAILY_LIMIT - userToday),
    included_user_remaining: Math.max(0, APP_USER_DAILY_LIMIT - includedUserToday),
    provider_units_today: providerUnitsToday,
    provider_units_limit: providerUnitsLimit,
    provider_units_remaining: providerUnitsLimit === null
      ? null
      : Math.max(0, providerUnitsLimit - providerUnitsToday),
    resets_at: nextUtcDay(),
  };
}

export async function reserveAppTailorQuota(
  db: D1Database,
  userId: string,
  provider: TailorProvider,
  model: string
): Promise<{ ok: true; usageId: string } | { ok: false; resets_at: string }> {
  const today = startOfUtcDay();
  const globalLimit = provider === "gemini"
    ? GEMINI_DAILY_LIMITS[model] ?? APP_GLOBAL_DAILY_FALLBACK
    : provider === "workers_ai"
      ? WORKERS_AI_GLOBAL_DAILY_REQUEST_LIMIT
      : APP_GLOBAL_DAILY_FALLBACK;
  const usageId = crypto.randomUUID();
  const reservedUnits = provider === "workers_ai" ? WORKERS_AI_RESERVATION_NEURONS : null;

  // One statement both checks and reserves quota, so concurrent requests cannot
  // all pass a count check before any one of them records usage.
  const result = await db.prepare(
    `INSERT INTO tailor_usage (
       id, user_id, key_source, provider, model, created_at, provider_units
     )
     SELECT ?, ?, 'app', ?, ?, ?, ?
     WHERE (
       SELECT COUNT(*) FROM tailor_usage
       WHERE key_source = 'app' AND user_id = ? AND created_at >= ?
     ) < ?
       AND (
         SELECT COUNT(*) FROM tailor_usage
         WHERE key_source = 'app' AND provider = ? AND model = ? AND created_at >= ?
       ) < ?
       AND (
         ? != 'workers_ai'
         OR (
           SELECT COALESCE(SUM(provider_units), 0) FROM tailor_usage
           WHERE key_source = 'app' AND provider = 'workers_ai' AND created_at >= ?
         ) + ? <= ?
       )`
  ).bind(
    usageId,
    userId,
    provider,
    model,
    new Date().toISOString(),
    reservedUnits,
    userId,
    today,
    APP_USER_DAILY_LIMIT,
    provider,
    model,
    today,
    globalLimit,
    provider,
    today,
    reservedUnits ?? 0,
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
     WHERE id = ? AND key_source = 'app'`
  ).bind(
    args.inputTokens || null,
    args.outputTokens || null,
    args.providerUnits,
    args.usageId
  ).run();
}
