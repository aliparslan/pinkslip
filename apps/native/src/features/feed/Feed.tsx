import { availableStages, filterCount, profileLocations } from "@pinkslip/core/feed-criteria";
import { usePreferences } from "@pinkslip/data";
import { useMemo } from "react";
import { useFeedSearch } from "./feed-search";

/** The filters' shared inputs: the profile's stages and metros. */
export function useFeedCriteria() {
  const search = useFeedSearch();
  const preferences = usePreferences();
  const profile = preferences.data?.search_profile;
  const available = useMemo(() => availableStages(profile?.target_levels), [profile?.target_levels]);
  const defaults = useMemo(() => profileLocations(profile), [profile]);
  return { search, preferences, profile, available, defaults, filters: filterCount(search, available, defaults) };
}
