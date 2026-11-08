import { useLocalSearchParams } from "expo-router";
import { TrackerScreen } from "../../../features/redesign/TrackerScreen";

/** Tracker. The route keeps the old name, library, so links still work. */
export default function TrackerTab() {
  const { view } = useLocalSearchParams<{ view?: string }>();
  return <TrackerScreen initialView={view === "applied" ? "applied" : view === "saved" ? "saved" : "all"} />;
}
