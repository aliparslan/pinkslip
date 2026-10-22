/** Support Pinkslip (owner, 2026-10-22, Paper "Support Pinkslip · Oct 22",
 * take A): tips through Stripe Payment Links. The links are the Worker's
 * `SUPPORT_LINKS`, named `once_<dollars>`, `once_other` and
 * `monthly_<dollars>`; `/api/v2/me` sends them parsed, and the app shows the
 * row only when there are some. */

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
