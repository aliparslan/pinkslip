import { router, usePathname } from "expo-router";
import { Tabs } from "expo-router/js-tabs";
import { NativeTabs } from "expo-router/unstable-native-tabs";
import { useEffect } from "react";
import { useUnistyles } from "react-native-unistyles";
import { onboardingDue } from "../../features/onboarding/launch";
import { OnboardingOnLaunch } from "../../features/onboarding/OnboardingOnLaunch";
import { useRedesign } from "../../features/redesign/flag";
import { rememberSearch } from "../../features/redesign/recent-searches";
import { setSearchText, useSearchText } from "../../features/redesign/search-text";
import { useTodayNeedsYou } from "../../features/redesign/TodayScreen";
import { WhatsNewOnLaunch } from "../../features/redesign/whats-new";
import { TabBar, useTabBarSpace, useTabBarSteppedAside } from "../../ui";

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
  // A page with its own pinned bar takes the tab bar's room back.
  const aside = useTabBarSteppedAside();
  // The app opens on Today, the first tab; "/" is still Jobs for links. A
  // new install stays on Jobs, where onboarding ends.
  const pathname = usePathname();
  useEffect(() => {
    if (pathname === "/" && !onboardingDue()) router.navigate("/today");
    // Only at launch: Jobs is "/" whenever you open it after.
  }, []);
  // The room under the pill is the page's white, so it reads as page.
  const padded = { sceneStyle: { paddingBottom: aside ? 0 : space, backgroundColor: theme.ui.color.bg } };
  // The Search tab's field sits in the bar, as iOS 26 draws it.
  const searchText = useSearchText();
  const search = { value: searchText, onChangeText: setSearchText, onSubmit: () => rememberSearch(searchText), placeholder: "Jobs and companies" };
  return <>
  <Tabs tabBar={(props) => <TabBar {...props} badges={{ "(today)": needsYou }} search={search} />} screenOptions={{ headerShown: false, animation: "none" }}>
    <Tabs.Screen name="(today)" />
    <Tabs.Screen name="(jobs)" />
    <Tabs.Screen name="(library)" />
    <Tabs.Screen name="(search)" />
    <Tabs.Screen name="(you)" options={padded} />
  </Tabs>
  <WhatsNewOnLaunch />
  <OnboardingOnLaunch />
  </>;
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
