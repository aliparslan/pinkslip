import { Stack } from "expo-router";
import { Alerts } from "../../../../features/alerts/Alerts";

export default function AlertsScreen() {
  return <>
    <Stack.Screen options={{ title: "Job alerts" }} />
    <Alerts />
  </>;
}
