import { Stack, useLocalSearchParams } from "expo-router";
import { Library } from "../../../features/library/Library";
import { useRedesign } from "../../../features/redesign/flag";
import { TrackerScreen } from "../../../features/redesign/TrackerScreen";

export default function LibraryScreen() {
  const { view } = useLocalSearchParams<{ view?: string }>();
  if (useRedesign()) return <TrackerScreen initialView={view === "applied" ? "applied" : view === "saved" ? "saved" : "all"} />;
  return <>
    <Stack.Screen options={{ title: "Library", headerLargeTitle: true }} />
    <Library initialView={view === "applied" ? "applied" : "saved"} />
  </>;
}
