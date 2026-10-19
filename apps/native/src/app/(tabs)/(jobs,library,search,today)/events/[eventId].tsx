import { useLocalSearchParams } from "expo-router";
import { EventPage } from "../../../../features/redesign/EventPage";

export default function EventScreen() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  return <EventPage eventId={eventId} />;
}
