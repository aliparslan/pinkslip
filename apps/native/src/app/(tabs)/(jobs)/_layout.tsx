import { Stack } from "expo-router";
import { useMemo } from "react";
import { stackOptions } from "../../../features/shell/stack-options";
import { useNavigatorTheme } from "../../../theme/appearance";
import { tabStackScreenLayout } from "../../../ui";

// Deep links into this tab land on top of its root screen.
export const unstable_settings = { initialRouteName: "index" };

export default function JobsStack() {
  const theme = useNavigatorTheme();
  return useMemo(() => <Stack screenOptions={stackOptions(theme)} screenLayout={tabStackScreenLayout("(jobs)")} />, [theme]);
}
