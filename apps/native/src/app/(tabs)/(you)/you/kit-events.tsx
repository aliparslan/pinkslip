import { Redirect } from "expo-router";
import { SampleEventsPage } from "../../../../features/redesign/EventPage";
import { redesignKitAvailable } from "../../../../features/redesign/flag";

/** A company's events and an event's page (E1, E2) on a sample. */
export default function EventsSampleScreen() {
  if (!redesignKitAvailable) return <Redirect href="/you" />;
  return <SampleEventsPage />;
}
