import { Stack } from "expo-router";
import { useState } from "react";
import { useUnistyles } from "react-native-unistyles";
import { Feed, useFeedCriteria } from "../../../features/feed/Feed";
import { FilterSheet } from "../../../features/feed/FilterSheet";
import { useSearchBar } from "../../../features/feed/useSearchBar";
import { useRedesign } from "../../../features/redesign/flag";
import { JobsScreen as RedesignedJobs } from "../../../features/redesign/JobsScreen";

export default function JobsScreen() {
  return useRedesign() ? <RedesignedJobs /> : <CurrentJobs />;
}

function CurrentJobs() {
  const { theme } = useUnistyles();
  const { filters } = useFeedCriteria();
  const searchBar = useSearchBar();
  const [filtersOpen, setFiltersOpen] = useState(false);
  return <>
    <Stack.Screen options={{
      title: "Jobs",
      headerLargeTitle: true,
      headerSearchBarOptions: { placeholder: "Search jobs or companies", hideWhenScrolling: false, ...searchBar },
      unstable_headerRightItems: () => [{
        type: "button",
        label: "Filters",
        icon: { type: "sfSymbol", name: "line.3.horizontal.decrease" },
        // The pink fill with its dark ink, not the system's red alert badge.
        badge: filters > 0 ? { value: String(filters), style: { backgroundColor: theme.colors["accent-fill"], color: theme.colors["accent-ink"] } } : undefined,
        accessibilityLabel: filters > 0 ? `Filters, ${filters} active` : "Filters",
        onPress: () => setFiltersOpen(true),
      }],
    }} />
    <Feed />
    <FilterSheet open={filtersOpen} onOpenChange={setFiltersOpen} />
  </>;
}
