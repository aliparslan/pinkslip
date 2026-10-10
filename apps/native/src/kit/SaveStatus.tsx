import type { SavePhase } from "@pinkslip/data";
import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { Text } from "./Text";

/** Where an autosave stands: nothing while clean, then Saving…, Saved, or
 * Couldn't save with Retry. Announced politely. */
export function SaveStatus({ phase, onRetry }: { phase: SavePhase; onRetry: () => void }) {
  if (phase === "clean") return null;
  return <View style={styles.root} accessibilityLiveRegion="polite">
    {phase === "error"
      ? <Text size="sm" tone="bad">Couldn't save · <Text size="sm" weight="semibold" tone="accent" onPress={onRetry}>Retry</Text></Text>
      : <Text size="sm" tone="ink-3">{phase === "saved" ? "Saved" : "Saving…"}</Text>}
  </View>;
}

const styles = StyleSheet.create(() => ({ root: { minHeight: 20 } }));
