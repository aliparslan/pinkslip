import { usePathname } from "expo-router";
import { NativeTabs } from "expo-router/unstable-native-tabs";
import { useUnistyles } from "react-native-unistyles";
import { useRedesign } from "../../features/redesign/flag";

/** The system tab bar: Jobs, Library, You, each with its own stack. The
 * redesigned job page pins Save and Apply where the tab bar sits, so the bar
 * steps aside there. */
export default function TabsLayout() {
  const { theme } = useUnistyles();
  const redesign = useRedesign();
  const onJobPage = /^\/jobs\/[^/]+$/.test(usePathname());
  return <NativeTabs tintColor={redesign ? theme.ui.color.ink : theme.colors.accent} hidden={redesign && onJobPage}>
    <NativeTabs.Trigger name="(jobs)">
      <NativeTabs.Trigger.Icon sf={{ default: "briefcase", selected: "briefcase.fill" }} />
      <NativeTabs.Trigger.Label>Jobs</NativeTabs.Trigger.Label>
    </NativeTabs.Trigger>
    <NativeTabs.Trigger name="(library)">
      <NativeTabs.Trigger.Icon sf={{ default: "bookmark", selected: "bookmark.fill" }} />
      <NativeTabs.Trigger.Label>Library</NativeTabs.Trigger.Label>
    </NativeTabs.Trigger>
    {/* iOS 26 sets the search tab apart and puts its field in the tab bar. */}
    <NativeTabs.Trigger name="(search)" role="search" hidden={!redesign}>
      <NativeTabs.Trigger.Label>Search</NativeTabs.Trigger.Label>
    </NativeTabs.Trigger>
    <NativeTabs.Trigger name="(you)">
      <NativeTabs.Trigger.Icon sf={{ default: "person.crop.circle", selected: "person.crop.circle.fill" }} />
      <NativeTabs.Trigger.Label>You</NativeTabs.Trigger.Label>
    </NativeTabs.Trigger>
  </NativeTabs>;
}
