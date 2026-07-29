export type PostedFilter = "any" | "dated" | "undated" | "evergreen";

import type { Job } from "./api";

export const PAGE_SIZE = 25;

// Live feed state, shared across navigations so the feed survives leaving and
// returning within a session. The Feed page binds straight to this object —
// this replaces the old module-level `feedCache` plus its hand-rolled
// 14-field copy-sync, which had to be kept in lockstep by hand.
export const feed = $state({
  jobs: [] as Job[],
  lastPolled: null as string | null,
  lastLoadedAt: 0,
  selectedLocations: ["All"] as string[],
  searchQuery: "",
  savedOnly: false,
  // "any" | "dated" | "undated". Undated postings come from boards that list a
  // role only while it is genuinely open (startups), so it is a signal to
  // filter *for*, not a gap.
  postedFilter: "any" as PostedFilter,
  minSalaryK: "",
  maxSalaryK: "",
  maxYoe: "",
  nextOffset: 0,
  hasMore: true,
  hydrated: false,
});

let userManuallySetLocations = false;

export function markLocationsManuallySet() {
  userManuallySetLocations = true;
}

export function syncFeedPreferences(profile?: { location_ids?: string[]; work_modes?: string[] } | null, force = false) {
  if (!profile) return;
  if (!force && userManuallySetLocations) return;

  const locationIds = profile.location_ids ?? [];
  const workModes = profile.work_modes ?? [];
  const onlyRemote = workModes.length === 1 && workModes[0] === "remote";

  if (onlyRemote) {
    feed.selectedLocations = ["Remote"];
  } else if (locationIds.length > 0 && locationIds.length < 10) {
    feed.selectedLocations = [...locationIds];
  } else {
    feed.selectedLocations = ["All"];
  }
}

