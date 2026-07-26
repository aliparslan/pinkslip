export type TailorProvider = "gemini" | "anthropic";
export type TailorKeySource = "app" | "user";

export const GEMINI_DAILY_LIMITS: Record<string, number> = {
  "gemini-3.1-flash-lite": 500,
  "gemini-3-flash": 20,
  "gemini-2.5-flash": 20,
  "gemini-2.5-flash-lite": 20,
};

const APP_USER_DAILY_LIMIT = 15;
const APP_GLOBAL_DAILY_FALLBACK = 1000;

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
}) {
  if (!args.db) return;
  await args.db.prepare(
    `INSERT INTO tailor_usage (id, user_id, key_source, provider, model, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(
    crypto.randomUUID(),
    args.userId,
    args.keySource,
    args.provider,
    args.model,
    new Date().toISOString()
  ).run();
}

export async function loadTailorUsage(args: {
  db: D1Database;
  userId: string;
  provider: TailorProvider;
  model: string;
}) {
  const today = startOfUtcDay();
  const [app, user] = await Promise.all([
    args.db.prepare(
      `SELECT COUNT(*) AS count
       FROM tailor_usage
       WHERE key_source = 'app'
         AND provider = ?
         AND model = ?
         AND created_at >= ?`
    ).bind(args.provider, args.model, today).first<{ count: number }>(),
    args.db.prepare(
      `SELECT COUNT(*) AS count
       FROM tailor_usage
       WHERE user_id = ?
         AND provider = ?
         AND model = ?
         AND created_at >= ?`
    ).bind(args.userId, args.provider, args.model, today).first<{ count: number }>(),
  ]);

  const dailyLimit = args.provider === "gemini" ? GEMINI_DAILY_LIMITS[args.model] ?? null : null;
  const appToday = app?.count ?? 0;
  const userToday = user?.count ?? 0;
  return {
    provider: args.provider,
    model: args.model,
    app_today: appToday,
    user_today: userToday,
    daily_limit: dailyLimit,
    app_remaining: dailyLimit === null ? null : Math.max(0, dailyLimit - appToday),
    user_remaining: Math.max(0, APP_USER_DAILY_LIMIT - userToday),
    resets_at: nextUtcDay(),
  };
}

export async function reserveAppTailorQuota(
  db: D1Database,
  userId: string,
  provider: TailorProvider,
  model: string
): Promise<{ ok: true } | { ok: false; resets_at: string }> {
  const today = startOfUtcDay();
  const globalLimit = provider === "gemini"
    ? GEMINI_DAILY_LIMITS[model] ?? APP_GLOBAL_DAILY_FALLBACK
    : APP_GLOBAL_DAILY_FALLBACK;

  // One statement both checks and reserves quota, so concurrent requests cannot
  // all pass a count check before any one of them records usage.
  const result = await db.prepare(
    `INSERT INTO tailor_usage (id, user_id, key_source, provider, model, created_at)
     SELECT ?, ?, 'app', ?, ?, ?
     WHERE (
       SELECT COUNT(*) FROM tailor_usage
       WHERE key_source = 'app' AND user_id = ? AND created_at >= ?
     ) < ?
       AND (
         SELECT COUNT(*) FROM tailor_usage
         WHERE key_source = 'app' AND provider = ? AND model = ? AND created_at >= ?
       ) < ?`
  ).bind(
    crypto.randomUUID(),
    userId,
    provider,
    model,
    new Date().toISOString(),
    userId,
    today,
    APP_USER_DAILY_LIMIT,
    provider,
    model,
    today,
    globalLimit
  ).run();
  return (result.meta.changes ?? 0) === 0
    ? { ok: false, resets_at: nextUtcDay() }
    : { ok: true };
}
