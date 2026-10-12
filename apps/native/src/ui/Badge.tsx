import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { Text } from "./Text";

/** A count that needs you: the pastel pink with dark text. Counts that don't
 * need you are plain grey text, not a badge. */
export function Badge({ count }: { count: number }) {
  return <View style={styles.root} accessibilityLabel={`${count} waiting`}>
    <Text role="footnote" weight="medium" tone="accent-ink">{count > 99 ? "99+" : count}</Text>
  </View>;
}

const styles = StyleSheet.create((theme) => ({
  root: {
    alignSelf: "flex-start",
    minWidth: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: theme.ui.space["1"],
    borderRadius: theme.ui.radius.full,
    backgroundColor: theme.ui.color["accent-fill"],
  },
}));
