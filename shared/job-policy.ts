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
