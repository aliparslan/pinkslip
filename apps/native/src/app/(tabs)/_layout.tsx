import * as Linking from "expo-linking";
import { router, usePathname } from "expo-router";
import { Tabs } from "expo-router/js-tabs";
import { useEffect } from "react";
import { useReducedMotion } from "react-native-reanimated";
import { onboardingDue } from "../../features/onboarding/launch";
import { OnboardingOnLaunch } from "../../features/onboarding/OnboardingOnLaunch";
import { LIVE_BAR_HEIGHT } from "../../features/redesign/apply-flow/WhileItRuns";
import { useLiveSends } from "../../features/redesign/sends/LiveSends";
import { useTodayNeedsYou } from "../../features/redesign/TodayScreen";
import { WhatsNewOnLaunch } from "../../features/redesign/whats-new";
import { appPathFor } from "../../platform/links";
import { TabBar } from "../../ui";
import { tabTransition, useTabMotion } from "../../ui/tab-motion";

/** Today, Jobs, Tracker, Search and You, each with its own stack, under our
 * tab bar (Paper "Tab bar · Oct 12", option C). It floats over the content
 * on every tab, You included (owner, 2026-10-18: a band under it read as a
 * dark box); each screen leaves room under its list. */
export default function TabsLayout() {
  const needsYou = useTodayNeedsYou();
  // Above the pill on every tab while Pinkslip applies (Paper "4 · While it runs").
  const live = useLiveSends();
  // The app opens on Today, the first tab; "/" is still Jobs for links. A
  // new install stays on Jobs, where onboarding ends.
  // A link that opened the app goes where it points (owner, 2026-11-07: a
  // shared job opened on Today, the job left behind on Jobs).
  const pathname = usePathname();
  // Still, or one of the slides being compared in the kit; Reduce Motion keeps it still.
  const tabMotion = useTabMotion();
  const reduceMotion = useReducedMotion();
  useEffect(() => {
    const launchedBy = Linking.getLinkingURL();
    const linked = launchedBy ? appPathFor(launchedBy) : null;
    if (pathname === "/" && !onboardingDue() && (!linked || linked === "/")) router.navigate("/today");
    // Only at launch: Jobs is "/" whenever you open it after.
  }, []);
  return <>
  <Tabs tabBar={(props) => <TabBar {...props} badges={{ "(today)": needsYou }} above={live} aboveHeight={LIVE_BAR_HEIGHT} />} screenOptions={{ headerShown: false, ...tabTransition(reduceMotion ? "still" : tabMotion) }}>
    <Tabs.Screen name="(today)" />
    <Tabs.Screen name="(jobs)" />
    <Tabs.Screen name="(library)" />
    <Tabs.Screen name="(search)" />
    <Tabs.Screen name="(you)" />
  </Tabs>
  <WhatsNewOnLaunch />
  <OnboardingOnLaunch />
  </>;
}
