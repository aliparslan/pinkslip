/**
 * The oldest dated posting that belongs in the feed. A role posted 29 calendar
 * days ago is still eligible; anything 30 days old or older is stale.
 */
export const MAX_POSTED_AGE_DAYS = 29;

const STALE_AFTER_MS = (MAX_POSTED_AGE_DAYS + 1) * 24 * 60 * 60 * 1000;

/** Undated roles stay eligible while their source continues to list them. */
export function isFreshPostedAt(
  postedAt: string | null,
  nowMs = Date.now()
): boolean {
  if (postedAt === null) return true;
  const postedMs = new Date(postedAt).getTime();
  if (!Number.isFinite(postedMs)) return false;
  return nowMs - postedMs < STALE_AFTER_MS;
}

const EARLY_CAREER_TITLE = /\b(?:intern(?:ship)?s?|co-?ops?|new grad(?:uate)?s?|graduate|university|campus|early career|entry[- ]level|emerging talent|apprentice(?:ship)?s?)\b/i;

/**
 * A title naming a cohort that hasn't started ("Summer 2027", "New Grad (2027)")
 * is open recruiting however long ago it was posted. Without this, a program we
 * first see on day 30 is never admitted, while the same program seen on day 29
 * stays for as long as it's listed. Next year counts; this year counts until June.
 */
export function namesUpcomingCohort(title: string, nowMs = Date.now()): boolean {
  if (!EARLY_CAREER_TITLE.test(title)) return false;
  const now = new Date(nowMs);
  const thisYear = now.getUTCFullYear();
  return [...title.matchAll(/\b(20\d{2})\b/g)].some(([, year]) =>
    Number(year) > thisYear || (Number(year) === thisYear && now.getUTCMonth() < 5));
}

/**
 * Titles companies use for standing pipeline requisitions rather than a
 * specific opening. These never close, so age alone would take a long time to
 * identify them; the wording gives it away immediately.
 */
const EVERGREEN_TITLE =
  /\b(?:general (?:interest|application)|talent (?:community|network|pool)|expression of interest|future opportunit(?:y|ies)|open application|speculative application|join our talent|keep in touch|didn'?t see|other opportunities)\b/i;

export function isEvergreenTitle(title: string): boolean {
  return EVERGREEN_TITLE.test(title);
}

/**
 * An evergreen posting is one the board still lists after it has aged out of
 * the freshness window, or one whose title advertises a standing pipeline.
 *
 * The distinction matters because "still listed but old" and "removed from the
 * board" mean opposite things: the first is a live standing requisition worth
 * surfacing on request, the second is a filled role that should close.
 */
export function isEvergreenPosting(
  title: string,
  postedAt: string | null,
  stillListed: boolean,
  nowMs = Date.now()
): boolean {
  if (isEvergreenTitle(title)) return true;
  return stillListed && postedAt !== null && !isFreshPostedAt(postedAt, nowMs);
}

/**
 * Off until the owner turns it on (decided 2026-11-10; see
 * docs/age-filter-eval-2026-11-09.md). Set it to the moment it goes on.
 *
 * Then Greenhouse postings carry the date they were first published instead of
 * their last edit, so old roles stop passing as new. And a job the 30-day rule
 * had already hidden by that moment stays hidden: a real date would otherwise
 * count about 2,600 hidden Greenhouse jobs as old but still listed and bring
 * them back. Turning it on also means the apps stop calling a Greenhouse date
 * "Updated" (packages/core/src/job-timing.ts, apps/native's job-facts.ts).
 */
export const REAL_POSTED_DATES_FROM: string | null = null;

/**
 * Whether a job its board still lists stays in the feed past the 30-day
 * window. Until `hiddenFrom`, that's `isEvergreenPosting` alone. From then on,
 * a job that had already aged out by its stored date before `hiddenFrom`, and
 * wasn't being kept, stays out (owner, 2026-11-09: "lets leave them hidden for
 * now"). A job that ages out later is kept as before.
 */
export function keepsPastWindow(
  listing: { title: string; postedAt: string | null },
  stored: { evergreen: boolean; postedAt: string | null },
  hiddenFrom: string | null = REAL_POSTED_DATES_FROM,
  nowMs = Date.now()
): boolean {
  if (!isEvergreenPosting(listing.title, listing.postedAt, true, nowMs)) return false;
  if (hiddenFrom === null || stored.evergreen || isEvergreenTitle(listing.title)) return true;
  return isFreshPostedAt(stored.postedAt, new Date(hiddenFrom).getTime());
}
