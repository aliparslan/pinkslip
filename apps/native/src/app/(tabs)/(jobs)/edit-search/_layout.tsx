import { Stack } from "expo-router";
import { useUnistyles } from "react-native-unistyles";
import { stackOptions } from "../../../../features/shell/stack-options";

/** Your search: a page sheet with its own stack, so each picker pushes inside it. */
export default function EditSearchStack() {
  const { theme } = useUnistyles();
  return <Stack screenOptions={{
    ...stackOptions(theme),
    headerTintColor: theme.ui.color.ink,
    contentStyle: { backgroundColor: theme.ui.color["screen-grouped"] },
  }} />;
}
