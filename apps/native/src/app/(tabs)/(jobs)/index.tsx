import { Stack } from "expo-router";
import { useRef, useState } from "react";
import { useUnistyles } from "react-native-unistyles";
import { Feed, useFeedCriteria } from "../../../features/feed/Feed";
import { feedSearch, setFeedSearch } from "../../../features/feed/feed-search";
import { FilterSheet } from "../../../features/feed/FilterSheet";

const SEARCH_DEBOUNCE_MS = 250;

export default function JobsScreen() {
  const { theme } = useUnistyles();
  const { filters } = useFeedCriteria();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const commit = (text: string) => {
    const next = { ...feedSearch() };
    if (text.trim()) next.q = text;
    else delete next.q;
    if ((next.q ?? "") !== (feedSearch().q ?? "")) setFeedSearch(next);
  };
  return <>
    <Stack.Screen options={{
      title: "Jobs",
      headerLargeTitle: true,
      headerSearchBarOptions: {
        placeholder: "Search jobs or companies",
        hideWhenScrolling: false,
        onChangeText: (event) => {
          const text = event.nativeEvent.text;
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => commit(text), SEARCH_DEBOUNCE_MS);
        },
        onSearchButtonPress: (event) => commit(event.nativeEvent.text),
        onCancelButtonPress: () => commit(""),
      },
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
