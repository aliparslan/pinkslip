import type { SupportOffer } from "@pinkslip/domain/support";

export type SupportOften = "once" | "monthly";
/** Dollars, or Other amount. */
export type SupportPick = number | "other";

/** What the pink button does: ask the Worker for a Stripe page for exactly
 * this tip, or open one of the older Payment Links. */
export type SupportTarget = { kind: "checkout"; dollars: number; monthly: boolean } | { kind: "link"; url: string };

/** The amounts listed. With Stripe checkout, the same ones for one time and
 * monthly; with only links, whichever links exist. */
export function supportAmounts(offer: SupportOffer, often: SupportOften): readonly number[] {
  if (offer.checkout) return offer.checkout.amounts;
  return (often === "once" ? offer.once : offer.monthly).map((amount) => amount.dollars);
}

// A Worker from before checkout leaves the field out rather than null, so
// these test it for a value, as the rest of the sheet does.
export function supportOffersMonthly(offer: SupportOffer): boolean {
  return Boolean(offer.checkout) || offer.monthly.length > 0;
}

/** Other amount: typed in the sheet with checkout, either way; typed on
 * Stripe's page with a link, one time only. */
export function supportOtherOffered(offer: SupportOffer, often: SupportOften): boolean {
  return Boolean(offer.checkout) || (often === "once" && offer.other !== null);
}

/** The sheet opens on $5 (as drawn), else the middle amount, else Other. */
export function defaultSupportPick(offer: SupportOffer, often: SupportOften): SupportPick {
  const amounts = supportAmounts(offer, often);
  if (amounts.includes(5)) return 5;
  return amounts[Math.floor((amounts.length - 1) / 2)] ?? "other";
}

/** Whether a pick is still on offer after switching one time and monthly. */
export function supportPickOffered(offer: SupportOffer, often: SupportOften, pick: SupportPick): boolean {
  return pick === "other" ? supportOtherOffered(offer, often) : supportAmounts(offer, often).includes(pick);
}

/** The dollars the button names: Other's typed amount with checkout; none
 * for a link's Other, whose amount is typed on Stripe's page. */
export function supportDollars(offer: SupportOffer, pick: SupportPick, typed: number | null): number | null {
  if (pick !== "other") return pick;
  return offer.checkout ? typed : null;
}

/** What the button does, or null while there's nothing to pay (Other with
 * no amount typed). */
export function supportTarget(offer: SupportOffer, often: SupportOften, pick: SupportPick, typed: number | null): SupportTarget | null {
  if (offer.checkout) {
    const dollars = supportDollars(offer, pick, typed);
    return dollars === null ? null : { kind: "checkout", dollars, monthly: often === "monthly" };
  }
  if (pick === "other") return often === "once" && offer.other ? { kind: "link", url: offer.other } : null;
  const url = (often === "once" ? offer.once : offer.monthly).find((amount) => amount.dollars === pick)?.url;
  return url ? { kind: "link", url } : null;
}

/** "Support with $7", "Support with $7 a month", or "Support Pinkslip"
 * while the amount isn't known here. */
export function supportButtonLabel(often: SupportOften, dollars: number | null): string {
  if (dollars === null) return "Support Pinkslip";
  return `Support with $${dollars}${often === "monthly" ? " a month" : ""}`;
}
