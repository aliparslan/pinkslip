import { router, usePathname } from "expo-router";
import { Tabs } from "expo-router/js-tabs";
import { NativeTabs } from "expo-router/unstable-native-tabs";
import { useEffect } from "react";
import { useUnistyles } from "react-native-unistyles";
import { useRedesign } from "../../features/redesign/flag";
import { useTodayNeedsYou } from "../../features/redesign/TodayScreen";
import { TabBar, useTabBarSpace } from "../../ui";

/** Today (the redesign only), Jobs, Tracker (Library on the system tab bar),
 * Search and You, each with its own stack. The redesign draws its own
 * floating tab bar; today's screens keep the system one. */
export default function TabsLayout() {
  return useRedesign() ? <PillTabs /> : <SystemTabs />;
}

/** Our tab bar (Paper "Tab bar · Oct 12", option C). It floats over the
 * content: redesigned screens (Jobs, Tracker, Search) leave room under their
 * lists; the You stack, which still has some of today's screens, gets the room as padding. */
function PillTabs() {
  const { theme } = useUnistyles();
  const space = useTabBarSpace();
  const needsYou = useTodayNeedsYou();
  // The app opens on Today, the first tab; "/" is still Jobs for links.
  const pathname = usePathname();
  useEffect(() => {
    if (pathname === "/") router.navigate("/today");
    // Only at launch: Jobs is "/" whenever you open it after.
  }, []);
  // The room under the pill is the page's white, so it reads as page.
  const padded = { sceneStyle: { paddingBottom: space, backgroundColor: theme.ui.color.bg } };
  return <Tabs tabBar={(props) => <TabBar {...props} badges={{ "(today)": needsYou }} />} screenOptions={{ headerShown: false, animation: "none" }}>
    <Tabs.Screen name="(today)" />
    <Tabs.Screen name="(jobs)" />
    <Tabs.Screen name="(library)" />
    <Tabs.Screen name="(search)" />
    <Tabs.Screen name="(you)" options={padded} />
  </Tabs>;
}

/** The system tab bar: Jobs, Library, You. */
function SystemTabs() {
  const { theme } = useUnistyles();
  return <NativeTabs tintColor={theme.colors.accent}>
    <NativeTabs.Trigger name="(today)" hidden>
      <NativeTabs.Trigger.Label>Today</NativeTabs.Trigger.Label>
    </NativeTabs.Trigger>
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
