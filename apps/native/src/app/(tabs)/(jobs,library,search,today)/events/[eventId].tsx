import { useLocalSearchParams } from "expo-router";
import { EventPage } from "../../../../features/redesign/EventPage";
import { TabBarFollowsTransition } from "../../../../ui";

export default function EventScreen() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  return <>
    <TabBarFollowsTransition />
    <EventPage eventId={eventId} />
  </>;
}
