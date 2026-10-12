import { Stack } from "expo-router";
import { useUnistyles } from "react-native-unistyles";
import { stackOptions } from "../../../features/shell/stack-options";

// Deep links into this tab land on top of its root screen.
export const unstable_settings = { initialRouteName: "index" };

export default function JobsStack() {
  const { theme } = useUnistyles();
  return <Stack screenOptions={stackOptions(theme)}>
    {/* Our own sheet over the feed: the screen is see-through and the sheet slides itself in. */}
    <Stack.Screen name="edit-search" options={{ presentation: "transparentModal", animation: "none", headerShown: false, gestureEnabled: false }} />
  </Stack>;
}
