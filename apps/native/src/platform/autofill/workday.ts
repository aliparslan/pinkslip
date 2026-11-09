const WORKDAY = /^https:\/\/[^/?#]+\.myworkdayjobs\.com\//;

export const isWorkdayUrl = (url: string) => WORKDAY.test(url);

const SIGN_IN = /^https:\/\/(accounts\.google\.com|appleid\.apple\.com|login\.microsoftonline\.com|([a-z]+\.)?linkedin\.com)(\/|$)/;

/** A sign-in provider's own page, which a form's "Sign in with" button can
 * lead to. Nothing on it is an application question. */
export const isSignInProvider = (url: string) => SIGN_IN.test(url);

/** Workday's posting only links to a page of choices, then a sign-in.
 * `<posting>/apply/applyManually` goes straight to the sign-in. Written as a
 * string match because Hermes' URL can't be counted on. */
export function assistedStartUrl(url: string): string {
  const posting = url.match(/^(https:\/\/[^/?#]+\.myworkdayjobs\.com(?:\/[^?#]*)?\/job\/[^?#]*?)\/*([?#].*)?$/);
  // Only after /job/: eBay's whole careers site is named "apply".
  if (!posting || /\/apply(\/|$)/.test(posting[1].split("/job/").slice(1).join("/job/"))) return url;
  return `${posting[1]}/apply/applyManually${posting[2] ?? ""}`;
}
