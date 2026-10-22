/** The iPhone's region ("US") from its locale, or null when the locale
 * names none. It stands in for the App Store storefront, which only StoreKit
 * knows: Apple allows a link out to pay (Support Pinkslip) on the US
 * storefront (3.1.1(a)). */
export function deviceRegion(locale = Intl.DateTimeFormat().resolvedOptions().locale): string | null {
  const region = locale.split(/[-_]/).slice(1).find((part) => /^[A-Za-z]{2}$/.test(part));
  return region ? region.toUpperCase() : null;
}
