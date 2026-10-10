import { Pressable, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { Text } from "./Text";

/** A failed autosave: "Couldn't save" with Retry. Saving and saved show
 * nothing; saves are quick. */
export function SaveStatus({ phase, onRetry }: { phase: "clean" | "dirty" | "saving" | "saved" | "error"; onRetry: () => void }) {
  if (phase !== "error") return null;
  return <View style={styles.root} accessibilityLiveRegion="polite">
    <Text size="sm" tone="bad">Couldn't save</Text>
    <Pressable accessibilityRole="button" accessibilityLabel="Retry saving" onPress={onRetry} style={styles.retry}>
      <Text size="sm" weight="semibold" tone="accent">Retry</Text>
    </Pressable>
  </View>;
}

const styles = StyleSheet.create((theme) => ({
  root: { flexDirection: "row", alignItems: "center", gap: theme.space["1"] },
  retry: { minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" },
}));
