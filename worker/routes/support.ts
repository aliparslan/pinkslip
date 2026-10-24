import { Hono } from "hono";
import { supportAmountAllowed } from "../../shared/support";
import { requireFlag } from "../feature-flags";
import { createSupportCheckout, SupportCheckoutError } from "../support";
import type { Env, Variables } from "../types";

/** Support Pinkslip: tips of any amount, one time or monthly (owner,
 * 2026-10-24). The app sends the amount and opens the Stripe page this
 * returns in Safari. Guests can tip too. */
const support = new Hono<{ Bindings: Env; Variables: Variables }>();

support.use("*", requireFlag("SUPPORT"));

support.post("/checkout", async (c) => {
  const body = await c.req.json<{ dollars?: unknown; monthly?: unknown }>().catch(() => ({} as { dollars?: unknown; monthly?: unknown }));
  if (!supportAmountAllowed(body.dollars) || (body.monthly !== undefined && typeof body.monthly !== "boolean")) {
    return c.json({ error: "Choose a whole-dollar amount from $1 to $500.", code: "invalid_amount" }, 400);
  }
  const key = c.env.STRIPE_SECRET_KEY?.trim();
  const product = c.env.SUPPORT_STRIPE_PRODUCT?.trim();
  if (!key || !product) return c.json({ error: "Tips aren't set up yet.", code: "support_unavailable" }, 503);
  try {
    const url = await createSupportCheckout({ key, product, dollars: body.dollars, monthly: body.monthly === true });
    return c.json({ url });
  } catch (error) {
    if (!(error instanceof SupportCheckoutError)) throw error;
    console.error("Support checkout failed:", error.message);
    return c.json({ error: "Couldn't reach Stripe. Try again.", code: "stripe_unavailable" }, 502);
  }
});

export default support;
