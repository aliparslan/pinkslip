import { SUPPORT_THANKS_PATH } from "../shared/support";
import { SITE_ORIGIN } from "./health-checks";

export class SupportCheckoutError extends Error {}

/** A Stripe Checkout Session for one tip (owner, 2026-10-24, Paper A3 and
 * A4): exactly `dollars`, once or every month, as a price of the Support
 * Pinkslip product. Stripe's page says "$7.00 per month" and, once paid,
 * sends people to /support/thanks, which opens the app. Returns the page. */
export async function createSupportCheckout(
  input: { key: string; product: string; dollars: number; monthly: boolean },
  fetcher: typeof fetch = fetch,
): Promise<string> {
  const form = new URLSearchParams({
    mode: input.monthly ? "subscription" : "payment",
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": "usd",
    "line_items[0][price_data][product]": input.product,
    "line_items[0][price_data][unit_amount]": String(input.dollars * 100),
    success_url: `${SITE_ORIGIN}${SUPPORT_THANKS_PATH}`,
    "metadata[source]": "pinkslip-app",
  });
  if (input.monthly) form.set("line_items[0][price_data][recurring][interval]", "month");
  const response = await fetcher("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: { authorization: `Bearer ${input.key}`, "content-type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
  const data = await response.json().catch(() => ({})) as { url?: string; error?: { message?: string } };
  if (!response.ok || !data.url) throw new SupportCheckoutError(data.error?.message ?? `Stripe answered ${response.status}`);
  return data.url;
}
