import { Stack } from "expo-router";
import { useUnistyles } from "react-native-unistyles";
import { stackOptions } from "../../../features/shell/stack-options";
import { tabStackScreenLayout } from "../../../ui";

// Deep links into this tab land on top of its root screen.
export const unstable_settings = { initialRouteName: "you/index" };

export default function YouStack() {
  const { theme } = useUnistyles();
  // Each page notes its transition, so the tab bar can leave and come back
  // with the page under one that hides it (Resume's lists, Help).
  return <Stack screenOptions={stackOptions(theme)} screenLayout={tabStackScreenLayout} />;
}
