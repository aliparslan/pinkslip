import type { FeedSearch } from "@pinkslip/core/feed-criteria";
import { useSyncExternalStore } from "react";

/** The feed's committed filters. The web keeps them in the URL; the app keeps
 * them here for the session, so the filter sheet and the feed share them and
 * the Jobs tab returns to them. */
let current: FeedSearch = {};
const listeners = new Set<() => void>();

export function setFeedSearch(next: FeedSearch) {
  current = next;
  for (const listener of listeners) listener();
}

export const feedSearch = () => current;

export function useFeedSearch(): FeedSearch {
  return useSyncExternalStore((listener) => { listeners.add(listener); return () => listeners.delete(listener); }, feedSearch);
}
