const WORKDAY = /^https:\/\/[^/?#]+\.myworkdayjobs\.com\//;

export const isWorkdayUrl = (url: string) => WORKDAY.test(url);

/** Workday's posting only links to a page of choices, then a sign-in.
 * `<posting>/apply/applyManually` goes straight to the sign-in. Written as a
 * string match because Hermes' URL can't be counted on. */
export function assistedStartUrl(url: string): string {
  const posting = url.match(/^(https:\/\/[^/?#]+\.myworkdayjobs\.com(?:\/[^?#]*)?\/job\/[^?#]*?)\/*([?#].*)?$/);
  if (!posting || /\/apply(\/|$)/.test(posting[1])) return url;
  return `${posting[1]}/apply/applyManually${posting[2] ?? ""}`;
}
