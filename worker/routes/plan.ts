import { Hono } from "hono";
import { requireAdmin } from "../auth";
import { planState, setPlanByAdmin } from "../plans";
import type { Env, Variables } from "../types";

/** Plans (step 9): what someone's plan is and what's left this week, for
 * the Plan page and the places limits bite. Payments come at the App Store
 * release; until then an admin gives Pro by hand. */
const plan = new Hono<{ Bindings: Env; Variables: Variables }>();

plan.get("/", async (c) => c.json(await planState(c.env, c.get("userId"))));

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
