/** Support Pinkslip (owner, 2026-10-22, Paper "Support Pinkslip · Oct 22",
 * take A). Tips go through a Stripe Checkout Session the Worker makes for
 * the amount picked or typed, one time or monthly (owner, Oct 24, A3 and
 * A4). Before that, tips used Payment Links, the Worker's `SUPPORT_LINKS`
 * (`once_<dollars>`, `once_other`, `monthly_<dollars>`), which builds up to
 * 1.3.8 still read; `/api/v2/me` sends both as `features.support`. */

export interface SupportAmount {
  dollars: number;
  url: string;
}

export interface SupportLinks {
  /** One-time tips, smallest first. */
  once: SupportAmount[];
  /** A one-time tip whose amount is typed on Stripe's page. Stripe can't
   * take a typed amount every month, so there's no monthly one. */
  other: string | null;
  /** Monthly tips, smallest first. */
  monthly: SupportAmount[];
}

/** Where every Payment Link sends people after paying. The site's
 * apple-app-site-association lists it, so the iPhone opens Pinkslip there. */
export const SUPPORT_THANKS_PATH = "/support/thanks";

const KEY = /^(once|monthly)_(\d{1,4}|other)$/;

function httpsUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

/** The Worker's `SUPPORT_LINKS`, a TOML table (an object) or the same as a
 * JSON string. Unknown names and anything that isn't an https link are
 * dropped; null when no one-time tip is left. */
export function parseSupportLinks(raw: unknown): SupportLinks | null {
  let table = raw;
  if (typeof raw === "string") {
    try {
      table = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!table || typeof table !== "object" || Array.isArray(table)) return null;
  const links: SupportLinks = { once: [], other: null, monthly: [] };
  for (const [name, value] of Object.entries(table)) {
    const match = KEY.exec(name.trim().toLowerCase());
    const url = httpsUrl(value);
    if (!match || !url) continue;
    const [, kind, amount] = match;
    if (amount === "other") {
      if (kind === "once") links.other = url;
      continue;
    }
    const dollars = Number(amount);
    if (dollars > 0) links[kind as "once" | "monthly"].push({ dollars, url });
  }
  links.once.sort((a, b) => a.dollars - b.dollars);
  links.monthly.sort((a, b) => a.dollars - b.dollars);
  return links.once.length || links.other ? links : null;
}

/** Any amount through a Checkout Session (POST /api/v2/support/checkout). */
export interface SupportCheckout {
  /** The amounts listed, smallest first; Other amount takes any other. */
  amounts: number[];
  /** Whole dollars, inclusive. */
  min: number;
  max: number;
}

/** What the Support sheet offers. The links stay for builds that predate
 * `checkout`; a build that knows `checkout` uses it whenever it's there. */
export interface SupportOffer extends SupportLinks {
  checkout: SupportCheckout | null;
}

export const SUPPORT_CHECKOUT: SupportCheckout = { amounts: [3, 5, 10], min: 1, max: 500 };

/** `features.support`: null when there's neither a Stripe key nor a link. */
export function supportOffer(rawLinks: unknown, checkoutReady: boolean): SupportOffer | null {
  const links = parseSupportLinks(rawLinks);
  if (!links && !checkoutReady) return null;
  return { ...(links ?? { once: [], other: null, monthly: [] }), checkout: checkoutReady ? SUPPORT_CHECKOUT : null };
}

/** A tip the Worker will make a page for: whole dollars within the range. */
export function supportAmountAllowed(dollars: unknown): dollars is number {
  return typeof dollars === "number" && Number.isInteger(dollars)
    && dollars >= SUPPORT_CHECKOUT.min && dollars <= SUPPORT_CHECKOUT.max;
}
