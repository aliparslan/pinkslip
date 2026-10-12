import { router, Stack } from "expo-router";
import { useUnistyles } from "react-native-unistyles";
import { faces, useUiFontsLoaded } from "../../ui";
import { JobsFeed } from "./JobsFeed";

/** The Jobs tab, redesigned: a large "Jobs" in Founders Grotesk and Edit
 * search (your saved search, as a sheet) at the top right. Searching is its
 * own tab. */
export function JobsScreen() {
  const { theme } = useUnistyles();
  const fonts = useUiFontsLoaded();
  return <>
    <Stack.Screen options={{
      title: "Jobs",
      headerLargeTitle: true,
      headerTintColor: theme.ui.color.ink,
      headerLargeTitleStyle: { color: theme.ui.color.ink, fontFamily: fonts ? faces.display : undefined },
      headerTitleStyle: { color: theme.ui.color.ink, fontFamily: fonts ? faces.textMedium : undefined },
      contentStyle: { backgroundColor: theme.ui.color.bg },
      unstable_headerRightItems: () => [{
        type: "button",
        label: "Edit search",
        icon: { type: "sfSymbol", name: "slider.horizontal.3" },
        accessibilityLabel: "Edit search",
        onPress: () => router.push("/edit-search"),
      }],
    }} />
    <JobsFeed />
  </>;
}
