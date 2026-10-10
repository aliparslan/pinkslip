import { Stack, useLocalSearchParams } from "expo-router";
import { Library } from "../../../features/library/Library";

export default function LibraryScreen() {
  const { view } = useLocalSearchParams<{ view?: string }>();
  return <>
    <Stack.Screen options={{ title: "Library", headerLargeTitle: true }} />
    <Library initialView={view === "applied" ? "applied" : "saved"} />
  </>;
}
