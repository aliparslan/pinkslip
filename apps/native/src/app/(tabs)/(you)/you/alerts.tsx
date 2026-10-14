import { Stack, useLocalSearchParams } from "expo-router";
import { Alerts } from "../../../../features/alerts/Alerts";
import { SampleAlertsPage } from "../../../../features/kit/you-sample";
import { redesignKitAvailable, useRedesign } from "../../../../features/redesign/flag";
import { AlertsPage } from "../../../../features/redesign/you/AlertsPage";

/** You → Alerts. The redesign kit opens it with every option on `?sample=on`. */
export default function AlertsScreen() {
  const { sample } = useLocalSearchParams<{ sample?: string }>();
  const redesign = useRedesign();
  if (redesign && redesignKitAvailable && sample === "on") return <SampleAlertsPage />;
  if (redesign) return <AlertsPage />;
  return <>
    <Stack.Screen options={{ title: "Job alerts" }} />
    <Alerts />
  </>;
}
