import { useLocalSearchParams } from "expo-router";
import { SampleAlertsPage } from "../../../../features/kit/you-sample";
import { redesignKitAvailable } from "../../../../features/redesign/flag";
import { AlertsPage } from "../../../../features/redesign/you/AlertsPage";

/** You → Alerts. The kit opens it with every option on `?sample=on`. */
export default function AlertsScreen() {
  const { sample } = useLocalSearchParams<{ sample?: string }>();
  if (redesignKitAvailable && sample === "on") return <SampleAlertsPage />;
  return <AlertsPage />;
}
