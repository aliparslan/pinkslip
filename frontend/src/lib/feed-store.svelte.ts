export type PostedFilter = "any" | "evergreen";

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
  // Evergreen roles remain part of the normal feed, but this can narrow the
  // results to those longer-running listings for deliberate discovery.
  postedFilter: "any" as PostedFilter,
  minSalaryK: "",
  maxSalaryK: "",
  // Zero through three years is the product-wide eligible band. The two-ended
  // slider can narrow either edge without ever exposing out-of-scope roles.
  minYoe: 0,
  maxYoe: 3,
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
  const includesRemote = workModes.includes("remote");

  if (onlyRemote) {
    feed.selectedLocations = ["Remote"];
  } else if (locationIds.length > 0 && locationIds.length < 10) {
    // Work mode and metro preferences are independent. Omitting Remote here
    // caused the feed's explicit location query to hide remote roles that had
    // already passed the user's profile matcher — disproportionately YC and
    // older evergreen listings.
    feed.selectedLocations = includesRemote
      ? ["Remote", ...locationIds]
      : [...locationIds];
  } else {
    feed.selectedLocations = ["All"];
  }
}
