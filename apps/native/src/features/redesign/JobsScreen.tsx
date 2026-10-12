import { Stack } from "expo-router";
import { useState } from "react";
import { useUnistyles } from "react-native-unistyles";
import { faces, useUiFontsLoaded } from "../../ui";
import { useFeedCriteria } from "../feed/Feed";
import { FilterSheet } from "../feed/FilterSheet";
import { useSearchBar } from "../feed/useSearchBar";
import { JobsFeed } from "./JobsFeed";

/** The Jobs tab, redesigned: a large "Jobs" in Founders Grotesk, the search
 * field, and Edit search at the top right with a count when it narrows. */
export function JobsScreen() {
  const { theme } = useUnistyles();
  const fonts = useUiFontsLoaded();
  const { filters } = useFeedCriteria();
  const searchBar = useSearchBar();
  const [editing, setEditing] = useState(false);
  return <>
    <Stack.Screen options={{
      title: "Jobs",
      headerLargeTitle: true,
      headerTintColor: theme.ui.color.ink,
      headerLargeTitleStyle: { color: theme.ui.color.ink, fontFamily: fonts ? faces.display : undefined },
      headerTitleStyle: { color: theme.ui.color.ink, fontFamily: fonts ? faces.textMedium : undefined },
      contentStyle: { backgroundColor: theme.ui.color.bg },
      headerSearchBarOptions: { placeholder: "Jobs or companies", hideWhenScrolling: false, ...searchBar },
      unstable_headerRightItems: () => [{
        type: "button",
        label: "Edit search",
        icon: { type: "sfSymbol", name: "slider.horizontal.3" },
        badge: filters > 0 ? { value: String(filters), style: { backgroundColor: theme.ui.color["accent-fill"], color: theme.ui.color["badge-ink"] } } : undefined,
        accessibilityLabel: filters > 0 ? `Edit search, ${filters} active` : "Edit search",
        onPress: () => setEditing(true),
      }],
    }} />
    <JobsFeed />
    <FilterSheet open={editing} onOpenChange={setEditing} />
  </>;
}
