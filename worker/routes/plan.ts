import { Hono } from "hono";
import { AppleStoreError, resolveAppleStoreConfig } from "../apple-store";
import { requireAdmin } from "../auth";
import { planState, setPlanByAdmin, syncAppleSubscription } from "../plans";
import type { Env, Variables } from "../types";

/** Plans (step 9): what someone's plan is and what's left this week, for
 * the Plan page and the places limits bite. Payments come at the App Store
 * release; until then an admin gives Pro by hand. */
const plan = new Hono<{ Bindings: Env; Variables: Variables }>();

plan.get("/", async (c) => c.json(await planState(c.env, c.get("userId"))));

/** After buying Pro, or to restore it: the app sends the transaction's id
 * (StoreKit's `Transaction.id`, bought with the user id as
 * `appAccountToken`). Pinkslip asks Apple about it and answers with the
 * plan. */
plan.post("/apple", async (c) => {
  const config = resolveAppleStoreConfig(c.env);
  if (!config) return c.json({ error: "Purchases aren't set up yet.", code: "purchases_unavailable" }, 503);
  const body = await c.req.json<{ transaction_id?: unknown }>().catch(() => ({} as { transaction_id?: unknown }));
  const transactionId = typeof body.transaction_id === "string" ? body.transaction_id.trim() : "";
  if (!/^\d{1,32}$/.test(transactionId)) return c.json({ error: "transaction_id is Apple's transaction id.", code: "invalid_transaction" }, 400);
  try {
    const result = await syncAppleSubscription(c.env.DB, config, { transactionId, userId: c.get("userId") });
    if (!result.ok) {
      const [status, error] = result.code === "owned_elsewhere"
        ? [409, "This subscription belongs to another Pinkslip account."] as const
        : [404, "Apple doesn't know that purchase."] as const;
      return c.json({ error, code: result.code }, status);
    }
    return c.json(await planState(c.env, c.get("userId")));
  } catch (error) {
    if (!(error instanceof AppleStoreError)) throw error;
    console.error("Apple purchase check failed:", error.message);
    return c.json({ error: "Couldn't reach the App Store. Try again.", code: "app_store_unavailable" }, 502);
  }
});

/** An admin gives someone Pro, until a date or with no end, or puts them
 * back on Free: `{ email, plan: "pro" | "free", ends_at?: ISO date }`. */
plan.put("/admin", requireAdmin, async (c) => {
  const body = await c.req.json<{ email?: unknown; user_id?: unknown; plan?: unknown; ends_at?: unknown }>()
    .catch(() => ({} as { email?: unknown; user_id?: unknown; plan?: unknown; ends_at?: unknown }));
  if (body.plan !== "pro" && body.plan !== "free") return c.json({ error: "plan is pro or free.", code: "invalid_plan" }, 400);
  const endsAt = body.ends_at === undefined || body.ends_at === null ? null : String(body.ends_at);
  if (endsAt !== null && Number.isNaN(Date.parse(endsAt))) return c.json({ error: "ends_at isn't a date.", code: "invalid_date" }, 400);
  const userId = typeof body.user_id === "string" && body.user_id
    ? body.user_id
    : typeof body.email === "string" && body.email.trim()
      ? (await c.env.DB.prepare(
        `SELECT user_id FROM auth_identities WHERE lower(email) = lower(?) OR (provider = 'email' AND lower(provider_subject) = lower(?))
         ORDER BY last_used_at DESC LIMIT 1`
      ).bind(body.email.trim(), body.email.trim()).first<{ user_id: string }>())?.user_id
      : undefined;
  if (!userId) return c.json({ error: "No account with that email.", code: "not_found" }, 404);
  await setPlanByAdmin(c.env.DB, userId, body.plan, endsAt === null ? null : new Date(endsAt).toISOString());
  return c.json({ user_id: userId, ...(await planState(c.env, userId)) });
});

export default plan;
