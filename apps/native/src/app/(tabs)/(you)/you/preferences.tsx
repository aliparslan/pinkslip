import { Stack } from "expo-router";
import { Preferences } from "../../../../features/preferences/Preferences";

export default function PreferencesScreen() {
  return <>
    <Stack.Screen options={{ title: "Job preferences" }} />
    <Preferences />
  </>;
}
