import { Stack } from "expo-router";
import { useMemo } from "react";
import { stackOptions } from "../../../features/shell/stack-options";
import { useNavigatorTheme } from "../../../theme/appearance";
import { tabStackScreenLayout } from "../../../ui";

// Deep links into this tab land on top of its root screen.
export const unstable_settings = { initialRouteName: "you/index" };

export default function YouStack() {
  const theme = useNavigatorTheme();
  // Each page notes its transition, so the tab bar can leave and come back
  // with the page under one that hides it (Resume's lists, Help).
  return useMemo(() => <Stack screenOptions={stackOptions(theme)} screenLayout={tabStackScreenLayout("(you)")} />, [theme]);
}
