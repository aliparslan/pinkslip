import type { SupportAmount, SupportLinks } from "@pinkslip/domain/support";

export type SupportOften = "once" | "monthly";
/** Dollars, or the amount typed on Stripe's page. */
export type SupportPick = number | "other";

/** The amounts for one time or monthly. */
export function supportAmounts(links: SupportLinks, often: SupportOften): readonly SupportAmount[] {
  return often === "once" ? links.once : links.monthly;
}

/** The sheet opens on $5 (as drawn), else the middle amount, else Other. */
export function defaultSupportPick(links: SupportLinks, often: SupportOften): SupportPick {
  const amounts = supportAmounts(links, often);
  if (amounts.some((amount) => amount.dollars === 5)) return 5;
  return amounts[Math.floor((amounts.length - 1) / 2)]?.dollars ?? "other";
}

/** Whether a pick is still on offer after switching between one time and
 * monthly (Other is one time only). */
export function supportPickOffered(links: SupportLinks, often: SupportOften, pick: SupportPick): boolean {
  if (pick === "other") return often === "once" && links.other !== null;
  return supportAmounts(links, often).some((amount) => amount.dollars === pick);
}

/** The Stripe page the pink button opens. */
export function supportUrl(links: SupportLinks, often: SupportOften, pick: SupportPick): string | null {
  if (pick === "other") return often === "once" ? links.other : null;
  return supportAmounts(links, often).find((amount) => amount.dollars === pick)?.url ?? null;
}

/** "Support with $5", "Support with $5 a month"; Other's amount is typed on
 * Stripe's page. */
export function supportButtonLabel(often: SupportOften, pick: SupportPick): string {
  if (pick === "other") return "Support Pinkslip";
  return `Support with $${pick}${often === "monthly" ? " a month" : ""}`;
}
