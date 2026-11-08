import { Stack } from "expo-router";
import { useUnistyles } from "react-native-unistyles";
import { tabStackOptions } from "../../../features/shell/stack-options";
import { tabStackScreenLayout } from "../../../ui";

// Deep links into this tab land on top of its root screen.
export const unstable_settings = { initialRouteName: "index" };

export default function JobsStack() {
  const { theme } = useUnistyles();
  return <Stack screenOptions={tabStackOptions(theme)} screenLayout={tabStackScreenLayout("(jobs)")} />;
}
