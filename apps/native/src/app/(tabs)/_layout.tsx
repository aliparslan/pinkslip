import { Tabs } from "expo-router/js-tabs";
import { NativeTabs } from "expo-router/unstable-native-tabs";
import { useUnistyles } from "react-native-unistyles";
import { useRedesign } from "../../features/redesign/flag";
import { TabBar, useTabBarSpace } from "../../ui";

/** Jobs, Tracker (Library for now), Search and You, each with its own stack.
 * The redesign draws its own floating tab bar; today's screens keep the
 * system one. */
export default function TabsLayout() {
  return useRedesign() ? <PillTabs /> : <SystemTabs />;
}

/** Our tab bar (Paper "Tab bar · Oct 12", option C). It floats over the
 * content: redesigned screens leave room under their lists, and today's
 * screens (Library, You) get the room as padding. */
function PillTabs() {
  const space = useTabBarSpace();
  const padded = { sceneStyle: { paddingBottom: space } };
  return <Tabs tabBar={(props) => <TabBar {...props} />} screenOptions={{ headerShown: false, animation: "none" }}>
    <Tabs.Screen name="(jobs)" />
    <Tabs.Screen name="(library)" options={padded} />
    <Tabs.Screen name="(search)" />
    <Tabs.Screen name="(you)" options={padded} />
  </Tabs>;
}

/** The system tab bar: Jobs, Library, You. */
function SystemTabs() {
  const { theme } = useUnistyles();
  return <NativeTabs tintColor={theme.colors.accent}>
    <NativeTabs.Trigger name="(jobs)">
      <NativeTabs.Trigger.Icon sf={{ default: "briefcase", selected: "briefcase.fill" }} />
      <NativeTabs.Trigger.Label>Jobs</NativeTabs.Trigger.Label>
    </NativeTabs.Trigger>
    <NativeTabs.Trigger name="(library)">
      <NativeTabs.Trigger.Icon sf={{ default: "bookmark", selected: "bookmark.fill" }} />
      <NativeTabs.Trigger.Label>Library</NativeTabs.Trigger.Label>
    </NativeTabs.Trigger>
    <NativeTabs.Trigger name="(search)" hidden>
      <NativeTabs.Trigger.Label>Search</NativeTabs.Trigger.Label>
    </NativeTabs.Trigger>
    <NativeTabs.Trigger name="(you)">
      <NativeTabs.Trigger.Icon sf={{ default: "person.crop.circle", selected: "person.crop.circle.fill" }} />
      <NativeTabs.Trigger.Label>You</NativeTabs.Trigger.Label>
    </NativeTabs.Trigger>
  </NativeTabs>;
}
