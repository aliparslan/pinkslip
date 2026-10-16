import { Redirect } from "expo-router";
import { useRedesign } from "../../../../features/redesign/flag";
import { OutreachSettingsPage } from "../../../../features/redesign/outreach/OutreachSettingsPage";

export default function OutreachScreen() {
  if (!useRedesign()) return <Redirect href="/you" />;
  return <OutreachSettingsPage />;
}
