import { availableRoles, availableStages, filterCount, profileLocations, type FeedSearch } from "@pinkslip/core/feed-criteria";
import { usePreferences } from "@pinkslip/data";
import { useMemo } from "react";
import { useMotionTrial } from "../../ui/motion-trial";
import { useFeedSearch } from "./feed-search";

/** The filters' shared inputs: the profile's stages, roles and metros. */
export function useFeedCriteria() {
  const chosen = useFeedSearch();
  const preferences = usePreferences();
  const profile = preferences.data?.search_profile;
  const roleChip = useMotionTrial("roleChip");
  const available = useMemo(() => availableStages(profile?.target_levels), [profile?.target_levels]);
  const roles = useMemo(() => (roleChip ? availableRoles(profile?.roles) : []), [roleChip, profile?.roles]);
  // A role taken out of the search, or a chip switched off, stops narrowing it.
  const search = useMemo<FeedSearch>(() => {
    if (!chosen.role || roles.includes(chosen.role)) return chosen;
    const { role: _role, ...rest } = chosen;
    return rest;
  }, [chosen, roles]);
  const defaults = useMemo(() => profileLocations(profile), [profile]);
  return { search, preferences, profile, available, roles, defaults, filters: filterCount(search, available, defaults) };
}
