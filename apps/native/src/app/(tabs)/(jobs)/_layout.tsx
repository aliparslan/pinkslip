import { Stack } from "expo-router";
import { useUnistyles } from "react-native-unistyles";
import { stackOptions } from "../../../features/shell/stack-options";

// Deep links into this tab land on top of its root screen.
export const unstable_settings = { initialRouteName: "index" };

export default function JobsStack() {
  const { theme } = useUnistyles();
  return <Stack screenOptions={stackOptions(theme)} />;
}
