import type { Job } from "./api";

export type FeedSort = "last_seen" | "last_posted" | "score";

export const PAGE_SIZE = 25;

// Live feed state, shared across navigations so the feed survives leaving and
// returning within a session. The Feed page binds straight to this object —
// this replaces the old module-level `feedCache` plus its hand-rolled
// 14-field copy-sync, which had to be kept in lockstep by hand.
export const feed = $state({
  jobs: [] as Job[],
  lastPolled: null as string | null,
  selectedLocations: ["All"] as string[],
  sortBy: "last_seen" as FeedSort,
  searchQuery: "",
  savedOnly: false,
  minMatch: 50,
  minSalaryK: "",
  maxSalaryK: "",
  maxYoe: "",
  notifyThreshold: 50,
  // True only while the user has a match filter that differs from their saved
  // profile threshold. When false, the feed follows the profile threshold so
  // changing it in Settings actually controls the feed.
  customMinMatch: false,
  nextOffset: 0,
  hasMore: true,
  hydrated: false,
});
